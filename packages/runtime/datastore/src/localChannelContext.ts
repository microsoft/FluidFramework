/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { IFluidDataStoreContext, ISummarizeResult, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { CreateContainerError } from "@fluidframework/container-utils";
import { convertToSummaryTree } from "@fluidframework/runtime-utils";
import { assert, Lazy } from "@fluidframework/common-utils";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./dataStoreRuntime";
import { ChannelStorageService } from "./channelStorageService";

/**
 * Channel context for a locally created channel
 */
export class LocalChannelContext implements IChannelContext {
    public channel: IChannel | undefined;
    private attached = false;
    private readonly pending: ISequencedDocumentMessage[] = [];
    private readonly services: Lazy<{
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    }>;
    private readonly dirtyFn: () => void;
    private readonly factory: IChannelFactory | undefined;

    constructor(
        private readonly id: string,
        registry: ISharedObjectRegistry,
        type: string,
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly dataStoreContext: IFluidDataStoreContext,
        private readonly storageService: IDocumentStorageService,
        private readonly submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        private readonly snapshotTree: ISnapshotTree | undefined,
    ) {
        let blobMap: Map<string, string> | undefined;
        const clonedSnapshotTree = cloneDeep(this.snapshotTree);
        if (clonedSnapshotTree !== undefined) {
            blobMap = new Map<string, string>();
            this.collectExtraBlobsAndSanitizeSnapshot(clonedSnapshotTree, blobMap);
        }
        this.services = new Lazy(() => {
            return createServiceEndpoints(
                this.id,
                this.dataStoreContext.connected,
                this.submitFn,
                this.dirtyFn,
                this.storageService,
                clonedSnapshotTree !== undefined ? Promise.resolve(clonedSnapshotTree) : undefined,
                blobMap !== undefined ?
                    Promise.resolve(blobMap) : undefined,
            );
        });
        this.factory = registry.get(type);
        if (this.factory === undefined) {
            throw new Error(`Channel Factory ${type} not registered`);
        }
        if (snapshotTree === undefined) {
            this.channel = this.factory.create(runtime, id);
        }
        this.dirtyFn = () => { dirtyFn(id); };
    }

    public async getChannel(): Promise<IChannel> {
        if (this.channel === undefined) {
            this.channel = await this.loadChannel();
        }
        return this.channel;
    }

    public get isLoaded(): boolean {
        return this.channel !== undefined;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        // Connection events are ignored if the data store is not yet attached or loaded
        if (this.attached && this.isLoaded) {
            this.services.value.deltaConnection.setConnectionState(connected);
        }
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        assert(this.attached, "Local channel must be attached when processing op");

        // A local channel may not be loaded in case where we rehydrate the container from a snapshot because of
        // delay loading. So after the container is attached and some other client joins which start generating
        // ops for this channel. So not loaded local channel can still receive ops and we store them to process later.
        if (this.isLoaded) {
            this.services.value.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(local === false,
                "Should always be remote because a local dds shouldn't generate ops before loading");
            this.pending.push(message);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, "Channel should be loaded to resubmit ops");
        assert(this.attached, "Local channel must be attached when resubmitting op");
        this.services.value.deltaConnection.reSubmit(content, localOpMetadata);
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     */
    public async summarize(fullTree: boolean = false, trackState: boolean = false): Promise<ISummarizeResult> {
        assert(this.isLoaded && this.channel !== undefined, "Channel should be loaded to take summary");
        const snapshot = snapshotChannel(this.channel);
        const summary = convertToSummaryTree(snapshot, fullTree);
        return summary;
    }

    public getAttachSummary(): ISummaryTreeWithStats {
        assert(this.isLoaded && this.channel !== undefined, "Channel should be loaded to take snapshot");
        const snapshot = snapshotChannel(this.channel);
        const summaryTree = convertToSummaryTree(snapshot, true /* fullTree */);
        assert(
            summaryTree.summary.type === SummaryType.Tree,
            "summarize should always return a tree when fullTree is true");
        return {
            stats: summaryTree.stats,
            summary: summaryTree.summary,
        };
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded, "Channel must not already be loaded when loading");
        assert(!!this.snapshotTree, "Snapshot should be provided to load from!!");

        assert(await this.services.value.objectStorage.contains(".attributes"), ".attributes blob should be present");
        const attributes = await readAndParse<IChannelAttributes>(
            this.services.value.objectStorage,
            ".attributes");

        assert(!!this.factory, "Factory should be there for local channel");
        // Services will be assigned during this load.
        const channel = await this.factory.load(
            this.runtime,
            this.id,
            this.services.value,
            undefined,
            attributes);

        // Commit changes.
        this.channel = channel;

        // Send all pending messages to the channel
        for (const message of this.pending) {
            try {
                this.services.value.deltaConnection.process(message, false, undefined /* localOpMetadata */);
            } catch (err) {
                // record sequence number for easier debugging
                const error = CreateContainerError(err);
                error.sequenceNumber = message.sequenceNumber;
                throw error;
            }
        }
        return this.channel;
    }

    public markAttached(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        if (this.isLoaded) {
            assert(!!this.channel, "Channel should be there if loaded!!");
            this.channel.connect(this.services.value);
        }
        this.attached = true;
    }

    private collectExtraBlobsAndSanitizeSnapshot(snapshotTree: ISnapshotTree, blobMap: Map<string, string>) {
        const blobMapInitial = new Map(Object.entries(snapshotTree.blobs));
        for (const [blobName, blobId] of blobMapInitial.entries()) {
            const blobValue = blobMapInitial.get(blobId);
            if (blobValue !== undefined) {
                blobMap.set(blobId, blobValue);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete snapshotTree.blobs[blobName];
            }
        }
        for (const value of Object.values(snapshotTree.trees)) {
            this.collectExtraBlobsAndSanitizeSnapshot(value, blobMap);
        }
    }
}
