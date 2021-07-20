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
export abstract class LocalChannelContextBase implements IChannelContext {
    public channel: IChannel | undefined;
    private attached = false;
    protected readonly pending: ISequencedDocumentMessage[] = [];
    protected factory: IChannelFactory | undefined;
    constructor(
        protected readonly id: string,
        protected readonly registry: ISharedObjectRegistry,
        protected readonly runtime: IFluidDataStoreRuntime,
        private readonly servicesGetter: () => Lazy<{
                readonly deltaConnection: ChannelDeltaConnection,
                readonly objectStorage: ChannelStorageService,
            }>,
    ) {
    }

    public async getChannel(): Promise<IChannel> {
        assert(this.channel !== undefined, "Channel should be defined");
        return this.channel;
    }

    public get isLoaded(): boolean {
        return this.channel !== undefined;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        // Connection events are ignored if the data store is not yet attached or loaded
        if (this.attached && this.isLoaded) {
            this.servicesGetter().value.deltaConnection.setConnectionState(connected);
        }
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        assert(this.attached, 0x188 /* "Local channel must be attached when processing op" */);

        // A local channel may not be loaded in case where we rehydrate the container from a snapshot because of
        // delay loading. So after the container is attached and some other client joins which start generating
        // ops for this channel. So not loaded local channel can still receive ops and we store them to process later.
        if (this.isLoaded) {
            this.servicesGetter().value.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(local === false,
                0x189 /* "Should always be remote because a local dds shouldn't generate ops before loading" */);
            this.pending.push(message);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, 0x18a /* "Channel should be loaded to resubmit ops" */);
        assert(this.attached, 0x18b /* "Local channel must be attached when resubmitting op" */);
        this.servicesGetter().value.deltaConnection.reSubmit(content, localOpMetadata);
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

    public markAttached(): void {
        if (this.attached) {
            throw new Error("Channel is already attached");
        }

        if (this.isLoaded) {
            assert(!!this.channel, 0x192 /* "Channel should be there if loaded!!" */);
            this.channel.connect(this.servicesGetter().value);
        }
        this.attached = true;
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

export class RehydratedLocalChannelContext extends LocalChannelContextBase {
    private readonly services: Lazy<{
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    }>;

    private readonly dirtyFn: () => void;

    constructor(
        id: string,
        registry: ISharedObjectRegistry,
        runtime: IFluidDataStoreRuntime,
        dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        private readonly snapshotTree: ISnapshotTree,
    ) {
        super(id, registry, runtime, () => this.services);
        let blobMap: Map<string, ArrayBufferLike> | undefined;
        const clonedSnapshotTree = cloneDeep(this.snapshotTree);
        if (clonedSnapshotTree !== undefined) {
            blobMap = new Map<string, ArrayBufferLike>();
            this.collectExtraBlobsAndSanitizeSnapshot(clonedSnapshotTree, blobMap);
        }
        this.services = new Lazy(() => {
            return createServiceEndpoints(
                this.id,
                dataStoreContext.connected,
                submitFn,
                this.dirtyFn,
                storageService,
                clonedSnapshotTree,
                blobMap,
            );
        });
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

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded, 0x18e /* "Channel must not already be loaded when loading" */);
        assert(await this.services.value.objectStorage.contains(".attributes"),
            0x190 /* ".attributes blob should be present" */);
        const attributes = await readAndParse<IChannelAttributes>(
            this.services.value.objectStorage,
            ".attributes");

        assert(this.factory === undefined, "Factory should be undefined before loading");
        this.factory = this.registry.get(attributes.type);
        if (this.factory === undefined) {
            throw new Error(`Channel Factory ${attributes.type} not registered`);
        }
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
}

export class LocalChannelContext extends LocalChannelContextBase {
    private readonly services: Lazy<{
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    }>;
    private readonly dirtyFn: () => void;
    constructor(
        id: string,
        registry: ISharedObjectRegistry,
        type: string,
        runtime: IFluidDataStoreRuntime,
        dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
    ) {
        super(id, registry, runtime, () => this.services);
        assert(type !== undefined, "Factory Type should be defined");
        this.factory = registry.get(type);
        if (this.factory === undefined) {
            throw new Error(`Channel Factory ${type} not registered`);
        }
        this.channel = this.factory.create(runtime, id);
        this.services = new Lazy(() => {
            return createServiceEndpoints(
                this.id,
                dataStoreContext.connected,
                submitFn,
                this.dirtyFn,
                storageService,
            );
        });
        this.dirtyFn = () => { dirtyFn(id); };
    }
}
