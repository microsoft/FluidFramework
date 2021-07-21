/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryBaseLogger, IDisposable } from "@fluidframework/common-definitions";
import { DataCorruptionError, extractSafePropertiesFromMessage } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    channelsTreeName,
    CreateChildSummarizerNodeFn,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
    IAttachMessage,
    IChannelSummarizeResult,
    IEnvelope,
    IFluidDataStoreChannel,
    IFluidDataStoreContextDetached,
    IGarbageCollectionData,
    IInboundSignalMessage,
    InboundAttachMessage,
    ISummarizeResult,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import {
     convertSnapshotTreeToSummaryTree,
     convertSummaryTreeToITree,
     convertToSummaryTree,
     create404Response,
     responseToException,
     SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { BlobCacheStorageService, buildSnapshotTree, readAndParseFromBlobs } from "@fluidframework/driver-utils";
import { assert, Lazy } from "@fluidframework/common-utils";
import { v4 as uuid } from "uuid";
import { TreeTreeEntry } from "@fluidframework/protocol-base";
import { GCDataBuilder, getChildNodesUsedRoutes } from "@fluidframework/garbage-collector";
import { DataStoreContexts } from "./dataStoreContexts";
import { ContainerRuntime } from "./containerRuntime";
import {
    FluidDataStoreContext,
    RemotedFluidDataStoreContext,
    LocalFluidDataStoreContext,
    createAttributesBlob,
    LocalDetachedFluidDataStoreContext,
} from "./dataStoreContext";
import {
    dataStoreAttributesBlobName,
    IContainerRuntimeMetadata,
    nonDataStorePaths,
    rootHasIsolatedChannels,
    ReadFluidDataStoreAttributes,
    getAttributesFormatVersion,
} from "./summaryFormat";

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

    private readonly disposeOnce = new Lazy<void>(()=>this.contexts.dispose());

    constructor(
        private readonly baseSnapshot: ISnapshotTree | undefined,
        private readonly runtime: ContainerRuntime,
        private readonly submitAttachFn: (attachContent: any) => void,
        private readonly getCreateChildSummarizerNodeFn:
            (id: string, createParam: CreateChildSummarizerNodeParam)  => CreateChildSummarizerNodeFn,
        private readonly deleteChildSummarizerNodeFn: (id: string) => void,
        baseLogger: ITelemetryBaseLogger,
        private readonly contexts: DataStoreContexts = new DataStoreContexts(baseLogger),
    ) {
        this.logger = ChildLogger.create(baseLogger);
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
                dataStoreContext = new RemotedFluidDataStoreContext(
                    key,
                    value,
                    this.runtime,
                    this.runtime.storage,
                    this.runtime.scope,
                    this.getCreateChildSummarizerNodeFn(key, { type: CreateSummarizerNodeSource.FromSummary }));
            } else {
                if (typeof value !== "object") {
                    throw new Error("Snapshot should be there to load from!!");
                }
                const snapshotTree = value;
                // Need to rip through snapshot.
                const attributes = readAndParseFromBlobs<ReadFluidDataStoreAttributes>(
                        snapshotTree.blobs,
                        snapshotTree.blobs[dataStoreAttributesBlobName]);
                // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
                // For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
                // However the feature of loading a detached container from snapshot, is added when the
                // snapshotFormatVersion is at least "0.1" (1), so we don't expect it to be anything else.
                const formatVersion = getAttributesFormatVersion(attributes);
                assert(formatVersion > 0,
                    0x1d5 /* `Invalid snapshot format version ${attributes.snapshotFormatVersion}` */);
                const pkgFromSnapshot = JSON.parse(attributes.pkg) as string[];

                dataStoreContext = new LocalFluidDataStoreContext(
                    key,
                    pkgFromSnapshot,
                    this.runtime,
                    this.runtime.storage,
                    this.runtime.scope,
                    this.getCreateChildSummarizerNodeFn(key, { type: CreateSummarizerNodeSource.FromSummary }),
                    (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
                    snapshotTree,
                    // If there is no isRootDataStore in the attributes blob, set it to true. This ensures that data
                    // stores in older documents are not garbage collected incorrectly. This may lead to additional
                    // roots in the document but they won't break.
                    attributes.isRootDataStore ?? true,
                );
            }
            this.contexts.addBoundOrRemoted(dataStoreContext);
        }
        this.logger.sendTelemetryEvent({
            eventName: "ContainerLoadStats",
            dataStoreCount: fluidDataStores.size,
            referencedDataStoreCount: fluidDataStores.size - unreferencedDataStoreCount,
        });
    }

    public processAttachMessage(message: ISequencedDocumentMessage, local: boolean) {
        const attachMessage = message.contents as InboundAttachMessage;
        // The local object has already been attached
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id),
                0x15e /* "Local object does not have matching attach message id" */);
            this.contexts.get(attachMessage.id)?.emit("attached");
            this.pendingAttach.delete(attachMessage.id);
            return;
        }

         // If a non-local operation then go and create the object, otherwise mark it as officially attached.
        if (this.contexts.has(attachMessage.id)) {
            const error = new DataCorruptionError(
                "Duplicate data store created with existing ID",
                extractSafePropertiesFromMessage(message),
            );
            throw error;
        }

        const flatBlobs = new Map<string, ArrayBufferLike>();
        let snapshotTree: ISnapshotTree | undefined;
        if (attachMessage.snapshot) {
            snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
        }

        // Include the type of attach message which is the pkg of the store to be
        // used by RemotedFluidDataStoreContext in case it is not in the snapshot.
        const pkg = [attachMessage.type];
        const remotedFluidDataStoreContext = new RemotedFluidDataStoreContext(
            attachMessage.id,
            snapshotTree,
            this.runtime,
            new BlobCacheStorageService(this.runtime.storage, flatBlobs),
            this.runtime.scope,
            this.getCreateChildSummarizerNodeFn(
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
                }),
            pkg);

        // Resolve pending gets and store off any new ones
        this.contexts.addBoundOrRemoted(remotedFluidDataStoreContext);

        // Equivalent of nextTick() - Prefetch once all current ops have completed
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(async () => remotedFluidDataStoreContext.realize());
    }

    public bindFluidDataStore(fluidDataStoreRuntime: IFluidDataStoreChannel): void {
        const id = fluidDataStoreRuntime.id;
        const localContext = this.contexts.getUnbound(id);
        assert(!!localContext, 0x15f /* "Could not find unbound context to bind" */);

        // If the container is detached, we don't need to send OP or add to pending attach because
        // we will summarize it while uploading the create new summary and make it known to other
        // clients.
        if (this.runtime.attachState !== AttachState.Detached) {
            localContext.emit("attaching");
            const message = localContext.generateAttachMessage();

            this.pendingAttach.set(id, message);
            this.submitAttachFn(message);
            this.attachOpFiredForDataStore.add(id);
        }

        this.contexts.bind(fluidDataStoreRuntime.id);
    }

    public createDetachedDataStoreCore(
        pkg: Readonly<string[]>,
        isRoot: boolean,
        id = uuid()): IFluidDataStoreContextDetached
    {
        const context = new LocalDetachedFluidDataStoreContext(
            id,
            pkg,
            this.runtime,
            this.runtime.storage,
            this.runtime.scope,
            this.getCreateChildSummarizerNodeFn(id, { type: CreateSummarizerNodeSource.Local }),
            (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
            undefined,
            isRoot,
        );
        this.contexts.addUnbound(context);
        return context;
    }

    public _createFluidDataStoreContext(pkg: string[], id: string, isRoot: boolean, props?: any) {
        const context = new LocalFluidDataStoreContext(
            id,
            pkg,
            this.runtime,
            this.runtime.storage,
            this.runtime.scope,
            this.getCreateChildSummarizerNodeFn(id, { type: CreateSummarizerNodeSource.Local }),
            (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
            undefined,
            isRoot,
            props,
        );
        this.contexts.addUnbound(context);
        return context;
    }

    public get disposed() {return this.disposeOnce.evaluated;}
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
    }

    public async getDataStore(id: string, wait: boolean): Promise<FluidDataStoreContext> {
        const context = await this.contexts.getBoundOrRemoted(id, wait);

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
                fluidDataStoreId: address,
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

    /**
     * Notifies this object to take the snapshot of the container.
     * @deprecated - Use summarize to get summary of the container runtime.
     */
    public async snapshot(): Promise<ITreeEntry[]> {
        // Iterate over each store and ask it to snapshot
        const fluidDataStoreSnapshotsP = Array.from(this.contexts).map(async ([fluidDataStoreId, value]) => {
            const summaryTree = await value.summarize(true /* fullTree */, false /* trackState */);
            assert(
                summaryTree.summary.type === SummaryType.Tree,
                0x164 /* "summarize should always return a tree when fullTree is true" */);
            // back-compat summary - Remove this once snapshot is removed.
            const snapshot = convertSummaryTreeToITree(summaryTree.summary);

            // If ID exists then previous commit is still valid
            return {
                fluidDataStoreId,
                snapshot,
            };
        });

        const entries: ITreeEntry[] = [];

        // Add in module references to the store snapshots
        const fluidDataStoreSnapshots = await Promise.all(fluidDataStoreSnapshotsP);

        // Sort for better diffing of snapshots (in replay tool, used to find bugs in snapshotting logic)
        fluidDataStoreSnapshots.sort((a, b) => a?.fluidDataStoreId.localeCompare(b.fluidDataStoreId));

        for (const fluidDataStoreSnapshot of fluidDataStoreSnapshots) {
            entries.push(new TreeTreeEntry(
                fluidDataStoreSnapshot.fluidDataStoreId,
                fluidDataStoreSnapshot.snapshot,
            ));
        }
        return entries;
    }

    public get size(): number {
        return this.contexts.size;
    }

    public async summarize(fullTree: boolean, trackState: boolean): Promise<IChannelSummarizeResult> {
        const gcDataBuilder = new GCDataBuilder();
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

                if (contextSummary.gcData !== undefined) {
                    // Prefix the child's id to the ids of its GC nodest. This gradually builds the id of each node to
                    // be a path from the root.
                    gcDataBuilder.prefixAndAddNodes(contextId, contextSummary.gcData.gcNodes);
                }
            }));

        // Get the outbound routes and add a GC node for this channel.
        gcDataBuilder.addNode("/", await this.getOutboundRoutes());
        return {
            ...summaryBuilder.getSummaryTree(),
            gcData: gcDataBuilder.getGCData(),
        };
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
     * Generates data used for garbage collection. It does the following:
     * 1. Calls into each child data store context to get its GC data.
     * 2. Prefixs the child context's id to the GC nodes in the child's GC data. This makes sure that the node can be
     *    idenfied as belonging to the child.
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
     * @returns the total number of data stores and the number of data stores that are unused.
     */
    public updateUsedRoutes(usedRoutes: string[]) {
        // Get a map of data store ids to routes used in it.
        const usedDataStoreRoutes = getChildNodesUsedRoutes(usedRoutes);

        // Verify that the used routes are correct.
        for (const [id] of usedDataStoreRoutes) {
            assert(this.contexts.has(id), 0x167 /* "Used route does not belong to any known data store" */);
        }

        // Update the used routes in each data store. Used routes is empty for unused data stores.
        for (const [contextId, context] of this.contexts) {
            context.updateUsedRoutes(usedDataStoreRoutes.get(contextId) ?? []);
        }

        // Return the number of data stores that are unused.
        const dataStoreCount = this.contexts.size;
        return {
            dataStoreCount,
            unusedDataStoreCount: dataStoreCount - usedDataStoreRoutes.size,
        };
    }

    /**
     * When running GC in test mode, this is called to delete objects whose routes are unused. This enables testing
     * scenarios with accessing deleted content.
     * @param unusedRoutes - The routes that are unused in all data stores in this Container.
     */
    public deleteUnusedRoutes(unusedRoutes: string[]) {
        assert(this.runtime.gcTestMode, 0x1df /* "Data stores should be deleted only in GC test mode" */);
        for (const route of unusedRoutes) {
            const dataStoreId = route.split("/")[1];
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
}

export function getSummaryForDatastores(
    snapshot: ISnapshotTree | undefined,
    metadata: IContainerRuntimeMetadata | undefined,
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
