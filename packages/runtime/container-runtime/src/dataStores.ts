/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryBaseLogger, IDisposable } from "@fluidframework/common-definitions";
import { DataCorruptionError, extractSafePropertiesFromMessage } from "@fluidframework/container-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
    channelsTreeName,
    CreateChildSummarizerNodeFn,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
    IAttachMessage,
    IEnvelope,
    IFluidDataStoreContextDetached,
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    IInboundSignalMessage,
    InboundAttachMessage,
    ISummarizeResult,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import {
     convertSnapshotTreeToSummaryTree,
     convertToSummaryTree,
     create404Response,
     responseToException,
     SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import { ChildLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { BlobCacheStorageService, buildSnapshotTree } from "@fluidframework/driver-utils";
import { assert, Lazy, LazyPromise } from "@fluidframework/common-utils";
import { v4 as uuid } from "uuid";
import { GCDataBuilder, unpackChildNodesUsedRoutes } from "@fluidframework/garbage-collector";
import { DataStoreContexts } from "./dataStoreContexts";
import { ContainerRuntime } from "./containerRuntime";
import {
    FluidDataStoreContext,
    RemoteFluidDataStoreContext,
    LocalFluidDataStoreContext,
    createAttributesBlob,
    LocalDetachedFluidDataStoreContext,
} from "./dataStoreContext";
import { IContainerRuntimeMetadata, nonDataStorePaths, rootHasIsolatedChannels } from "./summaryFormat";
import { IDataStoreAliasMessage, isDataStoreAliasMessage } from "./dataStore";
import { GCNodeType } from "./garbageCollection";

type PendingAliasResolve = (success: boolean) => void;

 /**
  * This class encapsulates data store handling. Currently it is only used by the container runtime,
  * but eventually could be hosted on any channel once we formalize the channel api boundary.
  */
export class DataStores implements IDisposable {
    // Stores tracked by the Domain
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    // 0.24 back-compat attachingBeforeSummary
    public readonly attachOpFiredForDataStore = new Set<string>();

    private readonly logger: ITelemetryLogger;

    private readonly disposeOnce = new Lazy<void>(() => this.contexts.dispose());

    public readonly containerLoadStats: {
        // number of dataStores during loadContainer
        readonly containerLoadDataStoreCount: number;
        // number of unreferenced dataStores during loadContainer
        readonly referencedDataStoreCount: number;
    };

    // Stores the ids of new data stores between two GC runs. This is used to notify the garbage collector of new
    // root data stores that are added.
    private dataStoresSinceLastGC: string[] = [];
    // The handle to the container runtime. This is used mainly for GC purposes to represent outbound reference from
    // the container runtime to other nodes.
    private readonly containerRuntimeHandle: IFluidHandle;

    constructor(
        private readonly baseSnapshot: ISnapshotTree | undefined,
        private readonly runtime: ContainerRuntime,
        private readonly submitAttachFn: (attachContent: any) => void,
        private readonly getCreateChildSummarizerNodeFn:
            (id: string, createParam: CreateChildSummarizerNodeParam) => CreateChildSummarizerNodeFn,
        private readonly deleteChildSummarizerNodeFn: (id: string) => void,
        baseLogger: ITelemetryBaseLogger,
        getBaseGCDetails: () => Promise<Map<string, IGarbageCollectionDetailsBase>>,
        private readonly dataStoreChanged: (
            dataStorePath: string, timestampMs: number, packagePath?: readonly string[]) => void,
        private readonly aliasMap: Map<string, string>,
        private readonly writeGCDataAtRoot: boolean,
        private readonly contexts: DataStoreContexts = new DataStoreContexts(baseLogger),
    ) {
        this.logger = ChildLogger.create(baseLogger);
        this.containerRuntimeHandle = new FluidObjectHandle(this.runtime, "/", this.runtime.IFluidHandleContext);

        const baseGCDetailsP = new LazyPromise(async () => {
            return getBaseGCDetails();
        });
        // Returns the base GC details for the data store with the given id.
        const dataStoreBaseGCDetails = async (dataStoreId: string) => {
            const baseGCDetails = await baseGCDetailsP;
            return baseGCDetails.get(dataStoreId);
        };

        // Extract stores stored inside the snapshot
        const fluidDataStores = new Map<string, ISnapshotTree>();
        if (baseSnapshot) {
            for (const [key, value] of Object.entries(baseSnapshot.trees)) {
                fluidDataStores.set(key, value);
            }
        }

        let unreferencedDataStoreCount = 0;
        // Create a context for each of them
        for (const [key, value] of fluidDataStores) {
            let dataStoreContext: FluidDataStoreContext;

            // counting number of unreferenced data stores
            if (value.unreferenced) {
                unreferencedDataStoreCount++;
            }
            // If we have a detached container, then create local data store contexts.
            if (this.runtime.attachState !== AttachState.Detached) {
                dataStoreContext = new RemoteFluidDataStoreContext({
                    id: key,
                    snapshotTree: value,
                    getBaseGCDetails: async () => dataStoreBaseGCDetails(key),
                    runtime: this.runtime,
                    storage: this.runtime.storage,
                    scope: this.runtime.scope,
                    createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(
                        key,
                        { type: CreateSummarizerNodeSource.FromSummary },
                    ),
                    writeGCDataAtRoot: this.writeGCDataAtRoot,
                    disableIsolatedChannels: this.runtime.disableIsolatedChannels,
                });
            } else {
                if (typeof value !== "object") {
                    throw new Error("Snapshot should be there to load from!!");
                }
                const snapshotTree = value;
                dataStoreContext = new LocalFluidDataStoreContext({
                    id: key,
                    pkg: undefined,
                    runtime: this.runtime,
                    storage: this.runtime.storage,
                    scope: this.runtime.scope,
                    createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(
                        key,
                        { type: CreateSummarizerNodeSource.FromSummary },
                    ),
                    makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(key),
                    snapshotTree,
                    isRootDataStore: undefined,
                    writeGCDataAtRoot: this.writeGCDataAtRoot,
                    disableIsolatedChannels: this.runtime.disableIsolatedChannels,
                });
            }
            this.contexts.addBoundOrRemoted(dataStoreContext);
        }
        this.containerLoadStats = {
            containerLoadDataStoreCount: fluidDataStores.size,
            referencedDataStoreCount: fluidDataStores.size - unreferencedDataStoreCount,
        };
    }

    public aliases(): ReadonlyMap<string, string> {
        return this.aliasMap;
    }

    public processAttachMessage(message: ISequencedDocumentMessage, local: boolean) {
        const attachMessage = message.contents as InboundAttachMessage;

        this.dataStoresSinceLastGC.push(attachMessage.id);

        // The local object has already been attached
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id),
                0x15e /* "Local object does not have matching attach message id" */);
            this.contexts.get(attachMessage.id)?.emit("attached");
            this.pendingAttach.delete(attachMessage.id);
            return;
        }

         // If a non-local operation then go and create the object, otherwise mark it as officially attached.
        if (this.alreadyProcessed(attachMessage.id)) {
            // TODO: dataStoreId may require a different tag from PackageData #7488
            const error = new DataCorruptionError(
                // pre-0.58 error message: duplicateDataStoreCreatedWithExistingId
                "Duplicate DataStore created with existing id",
                {
                    ...extractSafePropertiesFromMessage(message),
                    dataStoreId: {
                        value: attachMessage.id,
                        tag: TelemetryDataTag.PackageData,
                    },
                },
            );
            throw error;
        }

        const flatBlobs = new Map<string, ArrayBufferLike>();
        let snapshotTree: ISnapshotTree | undefined;
        if (attachMessage.snapshot) {
            snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
        }

        // Include the type of attach message which is the pkg of the store to be
        // used by RemoteFluidDataStoreContext in case it is not in the snapshot.
        const pkg = [attachMessage.type];
        const remoteFluidDataStoreContext = new RemoteFluidDataStoreContext({
            id: attachMessage.id,
            snapshotTree,
            // New data stores begin with empty GC details since GC hasn't run on them yet.
            getBaseGCDetails: async () => { return {}; },
            runtime: this.runtime,
            storage: new BlobCacheStorageService(this.runtime.storage, flatBlobs),
            scope: this.runtime.scope,
            createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(
                attachMessage.id,
                {
                    type: CreateSummarizerNodeSource.FromAttach,
                    sequenceNumber: message.sequenceNumber,
                    snapshot: attachMessage.snapshot ?? {
                        entries: [createAttributesBlob(
                            pkg,
                            true /* isRootDataStore */,
                            this.runtime.disableIsolatedChannels,
                        )],
                    },
                },
            ),
            writeGCDataAtRoot: this.writeGCDataAtRoot,
            disableIsolatedChannels: this.runtime.disableIsolatedChannels,
            pkg,
        });

        this.contexts.addBoundOrRemoted(remoteFluidDataStoreContext);
    }

    public processAliasMessage(
        message: ISequencedDocumentMessage,
        localOpMetadata: unknown,
        local: boolean,
    ): void {
        const aliasMessage = message.contents as IDataStoreAliasMessage;
        if (!isDataStoreAliasMessage(aliasMessage)) {
            throw new DataCorruptionError(
                "malformedDataStoreAliasMessage",
                {
                    ...extractSafePropertiesFromMessage(message),
                },
            );
        }

        const resolve = localOpMetadata as PendingAliasResolve;
        const aliasResult = this.processAliasMessageCore(aliasMessage);
        if (local) {
            resolve(aliasResult);
        }
    }

    public processAliasMessageCore(aliasMessage: IDataStoreAliasMessage): boolean {
        if (this.alreadyProcessed(aliasMessage.alias)) {
            return false;
        }

        const context = this.contexts.get(aliasMessage.internalId);
        if (context === undefined) {
            this.logger.sendErrorEvent({
                eventName: "AliasFluidDataStoreNotFound",
                fluidDataStoreId: aliasMessage.internalId,
            });
            return false;
        }

        const handle = new FluidObjectHandle(
            context,
            aliasMessage.internalId,
            this.runtime.IFluidHandleContext,
        );
        this.runtime.addedGCOutboundReference(this.containerRuntimeHandle, handle);

        this.aliasMap.set(aliasMessage.alias, context.id);
        context.setInMemoryRoot();
        return true;
    }

    private alreadyProcessed(id: string): boolean {
        return this.aliasMap.get(id) !== undefined || this.contexts.get(id) !== undefined;
    }

    /**
     * Make the data stores locally visible in the container graph by moving the data store context from unbound to
     * bound list. This data store can now be reached from the root.
     * @param id - The id of the data store context to make visible.
     */
    private makeDataStoreLocallyVisible(id: string): void {
        const localContext = this.contexts.getUnbound(id);
        assert(!!localContext, 0x15f /* "Could not find unbound context to bind" */);

        /**
         * If the container is not detached, it is globally visible to all clients. This data store should also be
         * globally visible. Move it to attaching state and send an "attach" op for it.
         * If the container is detached, this data store will be part of the summary that makes the container attached.
         */
        if (this.runtime.attachState !== AttachState.Detached) {
            localContext.emit("attaching");
            const message = localContext.generateAttachMessage();

            this.pendingAttach.set(id, message);
            this.submitAttachFn(message);
            this.attachOpFiredForDataStore.add(id);
        }

        this.contexts.bind(id);
    }

    public createDetachedDataStoreCore(
        pkg: Readonly<string[]>,
        isRoot: boolean,
        id = uuid()): IFluidDataStoreContextDetached {
        const context = new LocalDetachedFluidDataStoreContext({
            id,
            pkg,
            runtime: this.runtime,
            storage: this.runtime.storage,
            scope: this.runtime.scope,
            createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(
                id,
                { type: CreateSummarizerNodeSource.Local },
            ),
            makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
            snapshotTree: undefined,
            isRootDataStore: isRoot,
            writeGCDataAtRoot: this.writeGCDataAtRoot,
            disableIsolatedChannels: this.runtime.disableIsolatedChannels,
        });
        this.contexts.addUnbound(context);
        return context;
    }

    public _createFluidDataStoreContext(pkg: string[], id: string, isRoot: boolean, props?: any) {
        const context = new LocalFluidDataStoreContext({
            id,
            pkg,
            runtime: this.runtime,
            storage: this.runtime.storage,
            scope: this.runtime.scope,
            createSummarizerNodeFn: this.getCreateChildSummarizerNodeFn(
                id,
                { type: CreateSummarizerNodeSource.Local },
            ),
            makeLocallyVisibleFn: () => this.makeDataStoreLocallyVisible(id),
            snapshotTree: undefined,
            isRootDataStore: isRoot,
            writeGCDataAtRoot: this.writeGCDataAtRoot,
            disableIsolatedChannels: this.runtime.disableIsolatedChannels,
            createProps: props,
        });
        this.contexts.addUnbound(context);
        return context;
    }

    public get disposed() { return this.disposeOnce.evaluated; }
    public readonly dispose = () => this.disposeOnce.value;

    public resubmitDataStoreOp(content: any, localOpMetadata: unknown) {
        const envelope = content as IEnvelope;
        const context = this.contexts.get(envelope.address);
        assert(!!context, 0x160 /* "There should be a store context for the op" */);
        context.reSubmit(envelope.contents, localOpMetadata);
    }

    public async applyStashedOp(content: any): Promise<unknown> {
        const envelope = content as IEnvelope;
        const context = this.contexts.get(envelope.address);
        assert(!!context, 0x161 /* "There should be a store context for the op" */);
        return context.applyStashedOp(envelope.contents);
    }

    public async applyStashedAttachOp(message: IAttachMessage) {
        this.pendingAttach.set(message.id, message);
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        this.processAttachMessage({ contents: message } as ISequencedDocumentMessage, false);
    }

    public processFluidDataStoreOp(message: ISequencedDocumentMessage, local: boolean, localMessageMetadata: unknown) {
        const envelope = message.contents as IEnvelope;
        const transformed = { ...message, contents: envelope.contents };
        const context = this.contexts.get(envelope.address);
        assert(!!context, 0x162 /* "There should be a store context for the op" */);
        context.process(transformed, local, localMessageMetadata);

        // Notify that a data store changed. This is used to detect if a deleted data store is being used.
        this.dataStoreChanged(
            `/${envelope.address}`,
            message.timestamp,
            context.isLoaded ? context.packagePath : undefined,
        );
    }

    public async getDataStore(id: string, wait: boolean): Promise<FluidDataStoreContext> {
        const internalId = this.aliasMap.get(id) ?? id;

        const context = await this.contexts.getBoundOrRemoted(internalId, wait);
        if (context === undefined) {
            // The requested data store does not exits. Throw a 404 response exception.
            const request = { url: id };
            throw responseToException(create404Response(request), request);
        }

        return context;
    }

    public processSignal(address: string, message: IInboundSignalMessage, local: boolean) {
        const context = this.contexts.get(address);
        if (!context) {
            // Attach message may not have been processed yet
            assert(!local, 0x163 /* "Missing datastore for local signal" */);
            this.logger.sendTelemetryEvent({
                eventName: "SignalFluidDataStoreNotFound",
                fluidDataStoreId: {
                    value: address,
                    tag: TelemetryDataTag.PackageData,
                },
            });
            return;
        }

        context.processSignal(message, local);
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        for (const [fluidDataStore, context] of this.contexts) {
            try {
                context.setConnectionState(connected, clientId);
            } catch (error) {
                this.logger.sendErrorEvent({
                    eventName: "SetConnectionStateError",
                    clientId,
                    fluidDataStore,
                }, error);
            }
        }
    }

    public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
        let eventName: "attaching" | "attached";
        if (attachState === AttachState.Attaching) {
            eventName = "attaching";
        } else {
            eventName = "attached";
        }
        for (const [,context] of this.contexts) {
            // Fire only for bounded stores.
            if (!this.contexts.isNotBound(context.id)) {
                context.emit(eventName);
            }
        }
    }

    public get size(): number {
        return this.contexts.size;
    }

    public async summarize(fullTree: boolean, trackState: boolean): Promise<ISummaryTreeWithStats> {
        const summaryBuilder = new SummaryTreeBuilder();

        // Iterate over each store and ask it to snapshot
        await Promise.all(Array.from(this.contexts)
            .filter(([_, context]) => {
                // Summarizer works only with clients with no local changes!
                assert(context.attachState !== AttachState.Attaching,
                    0x165 /* "Summarizer cannot work if client has local changes" */);
                return context.attachState === AttachState.Attached;
            }).map(async ([contextId, context]) => {
                const contextSummary = await context.summarize(fullTree, trackState);
                summaryBuilder.addWithStats(contextId, contextSummary);
            }));

        return summaryBuilder.getSummaryTree();
    }

    public createSummary(): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        // Attaching graph of some stores can cause other stores to get bound too.
        // So keep taking summary until no new stores get bound.
        let notBoundContextsLength: number;
        do {
            const builderTree = builder.summary.tree;
            notBoundContextsLength = this.contexts.notBoundLength();
            // Iterate over each data store and ask it to snapshot
            Array.from(this.contexts)
                .filter(([key, _]) =>
                    // Take summary of bounded data stores only, make sure we haven't summarized them already
                    // and no attach op has been fired for that data store because for loader versions <= 0.24
                    // we set attach state as "attaching" before taking createNew summary.
                    !(this.contexts.isNotBound(key)
                        || builderTree[key]
                        || this.attachOpFiredForDataStore.has(key)),
                )
                .map(([key, value]) => {
                    let dataStoreSummary: ISummarizeResult;
                    if (value.isLoaded) {
                        const snapshot = value.generateAttachMessage().snapshot;
                        dataStoreSummary = convertToSummaryTree(snapshot, true);
                    } else {
                        // If this data store is not yet loaded, then there should be no changes in the snapshot from
                        // which it was created as it is detached container. So just use the previous snapshot.
                        assert(!!this.baseSnapshot,
                            0x166 /* "BaseSnapshot should be there as detached container loaded from snapshot" */);
                        dataStoreSummary = convertSnapshotTreeToSummaryTree(this.baseSnapshot.trees[key]);
                    }
                    builder.addWithStats(key, dataStoreSummary);
                });
        } while (notBoundContextsLength !== this.contexts.notBoundLength());

        return builder.getSummaryTree();
    }

    /**
     * Before GC runs, called by the garbage collector to update any pending GC state.
     * The garbage collector needs to know all outbound references that are added. Since root data stores are not
     * explicitly marked as referenced, notify GC of new root data stores that were added since the last GC run.
     */
    public async updateStateBeforeGC(): Promise<void> {
        for (const id of this.dataStoresSinceLastGC) {
            const context = this.contexts.get(id);
            assert(context !== undefined, 0x2b6 /* `Missing data store context with id ${id}` */);
            if (await context.isRoot()) {
                // A root data store is basically a reference from the container runtime to the data store.
                const handle = new FluidObjectHandle(context, id, this.runtime.IFluidHandleContext);
                this.runtime.addedGCOutboundReference(this.containerRuntimeHandle, handle);
            }
        }
        this.dataStoresSinceLastGC = [];
    }

    /**
     * Generates data used for garbage collection. It does the following:
     * 1. Calls into each child data store context to get its GC data.
     * 2. Prefixes the child context's id to the GC nodes in the child's GC data. This makes sure that the node can be
     *    identified as belonging to the child.
     * 3. Adds a GC node for this channel to the nodes received from the children. All these nodes together represent
     *    the GC data of this channel.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        const builder = new GCDataBuilder();
        // Iterate over each store and get their GC data.
        await Promise.all(Array.from(this.contexts)
            .filter(([_, context]) => {
                // Get GC data only for attached contexts. Detached contexts are not connected in the GC reference
                // graph so any references they might have won't be connected as well.
                return context.attachState === AttachState.Attached;
            }).map(async ([contextId, context]) => {
                const contextGCData = await context.getGCData(fullGC);
                // Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
                // This also gradually builds the id of each node to be a path from the root.
                builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
            }));

        // Get the outbound routes and add a GC node for this channel.
        builder.addNode("/", await this.getOutboundRoutes());
        return builder.getGCData();
    }

    /**
     * After GC has run, called to notify this Container's data stores of routes that are used in it.
     * @param usedRoutes - The routes that are used in all data stores in this Container.
     * @param gcTimestamp - The time when GC was run that generated these used routes. If any node node becomes
     * unreferenced as part of this GC run, this should be used to update the time when it happens.
     */
    public updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number) {
        // Get a map of data store ids to routes used in it.
        const usedDataStoreRoutes = unpackChildNodesUsedRoutes(usedRoutes);

        // Verify that the used routes are correct.
        for (const [id] of usedDataStoreRoutes) {
            assert(this.contexts.has(id), 0x167 /* "Used route does not belong to any known data store" */);
        }

        // Update the used routes in each data store. Used routes is empty for unused data stores.
        for (const [contextId, context] of this.contexts) {
            context.updateUsedRoutes(usedDataStoreRoutes.get(contextId) ?? [], gcTimestamp);
        }
    }

    /**
     * When running GC in test mode, this is called to delete objects whose routes are unused. This enables testing
     * scenarios with accessing deleted content.
     * @param unusedRoutes - The routes that are unused in all data stores in this Container.
     */
    public deleteUnusedRoutes(unusedRoutes: string[]) {
        for (const route of unusedRoutes) {
            const pathParts = route.split("/");
            // Delete data store only if its route (/datastoreId) is in unusedRoutes. We don't want to delete a data
            // store based on its DDS being unused.
            if (pathParts.length > 2) {
                continue;
            }
            const dataStoreId = pathParts[1];
            assert(this.contexts.has(dataStoreId), 0x2d7 /* `${dataStoreId} is not a data store` */);
            // Delete the contexts of unused data stores.
            this.contexts.delete(dataStoreId);
            // Delete the summarizer node of the unused data stores.
            this.deleteChildSummarizerNodeFn(dataStoreId);
        }
    }

    /**
     * Returns the outbound routes of this channel. Only root data stores are considered referenced and their paths are
     * part of outbound routes.
     */
    private async getOutboundRoutes(): Promise<string[]> {
        const outboundRoutes: string[] = [];
        for (const [contextId, context] of this.contexts) {
            const isRootDataStore = await context.isRoot();
            if (isRootDataStore) {
                outboundRoutes.push(`/${contextId}`);
            }
        }
        return outboundRoutes;
    }

    /**
     * Called during GC to retrieve the package path of a data store node with the given path.
     */
    public getDataStorePackagePath(nodePath: string): readonly string[] | undefined {
        // If the node belongs to a data store, return its package path if the data store is loaded. For DDSs, we return
        // the package path of the data store that contains it.
        const context = this.contexts.get(nodePath.split("/")[1]);
        return context?.isLoaded ? context.packagePath : undefined;
    }

    /**
     * Called by GC to determine if a node is for a data store or for an object within a data store (for e.g. DDS).
     * @returns the GC node type if the node belongs to a data store or object within data store, undefined otherwise.
     */
    public getGCNodeType(nodePath: string): GCNodeType | undefined {
        const pathParts = nodePath.split("/");
        if (!this.contexts.has(pathParts[1])) {
            return undefined;
        }

        // Data stores paths are of the format "/dataStoreId".
        // Sub data store paths are of the format "/dataStoreId/subPath/...".
        if (pathParts.length === 2) {
            return GCNodeType.DataStore;
        }
        return GCNodeType.SubDataStore;
    }
}

export function getSummaryForDatastores(
    snapshot: ISnapshotTree | undefined,
    metadata?: IContainerRuntimeMetadata,
): ISnapshotTree | undefined {
    if (!snapshot) {
        return undefined;
    }

    if (rootHasIsolatedChannels(metadata)) {
        const datastoresSnapshot = snapshot.trees[channelsTreeName];
        assert(!!datastoresSnapshot, 0x168 /* `expected ${channelsTreeName} tree in snapshot` */);
        return datastoresSnapshot;
    } else {
        // back-compat: strip out all non-datastore paths before giving to DataStores object.
        const datastoresTrees: ISnapshotTree["trees"] = {};
        for (const [key, value] of Object.entries(snapshot.trees)) {
            if (!nonDataStorePaths.includes(key)) {
                datastoresTrees[key] = value;
            }
        }
        return {
            ...snapshot,
            trees: datastoresTrees,
        };
    }
}
