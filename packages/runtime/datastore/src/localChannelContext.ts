/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import {
    IContextSummarizeResult,
    IFluidDataStoreContext,
    IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { CreateProcessingError } from "@fluidframework/container-utils";
import { assert, Lazy, stringToBuffer } from "@fluidframework/common-utils";
import {
    createServiceEndpoints,
    IChannelContext,
    summarizeChannel,
} from "./channelContext";
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
        let blobMap: Map<string, ArrayBufferLike> | undefined;
        const clonedSnapshotTree = cloneDeep(this.snapshotTree);
        if (clonedSnapshotTree !== undefined) {
            blobMap = new Map<string, ArrayBufferLike>();
            this.collectExtraBlobsAndSanitizeSnapshot(clonedSnapshotTree, blobMap);
        }
        this.services = new Lazy(() => {
            return createServiceEndpoints(
                this.id,
                this.dataStoreContext.connected,
                this.submitFn,
                this.dirtyFn,
                this.storageService,
                clonedSnapshotTree,
                blobMap,
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
            this.channel = await this.loadChannel()
                // eslint-disable-next-line @typescript-eslint/no-throw-literal
                .catch((err)=>{throw CreateProcessingError(err, undefined);});
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
        assert(this.attached, 0x188 /* "Local channel must be attached when processing op" */);

        // A local channel may not be loaded in case where we rehydrate the container from a snapshot because of
        // delay loading. So after the container is attached and some other client joins which start generating
        // ops for this channel. So not loaded local channel can still receive ops and we store them to process later.
        if (this.isLoaded) {
            this.services.value.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(local === false,
                0x189 /* "Should always be remote because a local dds shouldn't generate ops before loading" */);
            this.pending.push(message);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, 0x18a /* "Channel should be loaded to resubmit ops" */);
        assert(this.attached, 0x18b /* "Local channel must be attached when resubmitting op" */);
        this.services.value.deltaConnection.reSubmit(content, localOpMetadata);
    }

    public applyStashedOp() {
        throw new Error("no stashed ops on local channel");
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     */
    public async summarize(fullTree: boolean = false, trackState: boolean = false): Promise<IContextSummarizeResult> {
        assert(this.isLoaded && this.channel !== undefined, 0x18c /* "Channel should be loaded to summarize" */);
        return summarizeChannel(this.channel, fullTree, trackState);
    }

    public getAttachSummary(): IContextSummarizeResult {
        assert(this.isLoaded && this.channel !== undefined, 0x18d /* "Channel should be loaded to take snapshot" */);
        return summarizeChannel(this.channel, true /* fullTree */, false /* trackState */);
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded, 0x18e /* "Channel must not already be loaded when loading" */);
        assert(!!this.snapshotTree, 0x18f /* "Snapshot should be provided to load from!!" */);

        assert(await this.services.value.objectStorage.contains(".attributes"),
            0x190 /* ".attributes blob should be present" */);
        const attributes = await readAndParse<IChannelAttributes>(
            this.services.value.objectStorage,
            ".attributes");

        assert(!!this.factory, 0x191 /* "Factory should be there for local channel" */);
        // Services will be assigned during this load.
        const channel = await this.factory.load(
            this.runtime,
            this.id,
            this.services.value,
            attributes);

        // Commit changes.
        this.channel = channel;

        // Send all pending messages to the channel
        for (const message of this.pending) {
            this.services.value.deltaConnection.process(message, false, undefined /* localOpMetadata */);
        }
        return this.channel;
    }

    public markAttached(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        if (this.isLoaded) {
            assert(!!this.channel, 0x192 /* "Channel should be there if loaded!!" */);
            this.channel.connect(this.services.value);
        }
        this.attached = true;
    }

    private collectExtraBlobsAndSanitizeSnapshot(snapshotTree: ISnapshotTree, blobMap: Map<string, ArrayBufferLike>) {
        const blobMapInitial = new Map(Object.entries(snapshotTree.blobs));
        for (const [blobName, blobId] of blobMapInitial.entries()) {
            const blobValue = blobMapInitial.get(blobId);
            if (blobValue !== undefined) {
                blobMap.set(blobId, stringToBuffer(blobValue, "base64"));
            } else {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete snapshotTree.blobs[blobName];
            }
        }
        for (const value of Object.values(snapshotTree.trees)) {
            this.collectExtraBlobsAndSanitizeSnapshot(value, blobMap);
        }
    }

    /**
     * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context.
     * Each node has a set of outbound routes to other GC nodes in the document. This should be called only after
     * the context has loaded.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        assert(this.isLoaded && this.channel !== undefined, 0x193 /* "Channel should be loaded to run GC" */);
        return this.channel.getGCData(fullGC);
    }

    public updateUsedRoutes(usedRoutes: string[]) {
        /**
         * Currently, DDSs are always considered referenced and are not garbage collected.
         * Once we have GC at DDS level, this channel context's used routes will be updated as per the passed
         * value. See - https://github.com/microsoft/FluidFramework/issues/4611
         */
    }
}
