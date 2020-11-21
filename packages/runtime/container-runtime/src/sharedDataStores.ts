/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { BlobCacheStorageService, buildSnapshotTree, readAndParseFromBlobs } from "@fluidframework/driver-utils";
import {
     ISequencedDocumentMessage,
      ISignalMessage,
      ISnapshotTree,
      ITree,
      SummaryType } from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreRegistry,
    CreateSummarizerNodeSource,
    IFluidDataStoreChannel,
    IFluidDataStoreContextDetached,
    IAttachMessage,
    IProvideFluidDataStoreRegistry,
    IInboundSignalMessage,
    ISignalEnvelop,
    IEnvelope,
    InboundAttachMessage,
    ISummarizeResult,
    CreateChildSummarizerNodeParam,
    SummarizeInternalFn,
    IGraphNode,
} from "@fluidframework/runtime-definitions";
import uuid from "uuid";
import { IDisposable, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
    convertSnapshotTreeToSummaryTree,
    convertSummaryTreeToITree,
    convertToSummaryTree,
    normalizeAndPrefixGCNodeIds,
    RequestParser,
    SummarizerNodeWithGC,
    SummaryTracker,
    SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import { TreeTreeEntry } from "@fluidframework/protocol-base";
import { ContainerMessageType, ContainerRuntime, nonDataStorePaths } from "./containerRuntime";
import {
    FluidDataStoreContext,
     RemotedFluidDataStoreContext,
     IFluidDataStoreAttributes,
     currentSnapshotFormatVersion,
     LocalFluidDataStoreContext,
     LocalDetachedFluidDataStoreContext,
     createAttributesBlob,
} from "./dataStoreContext";

export class SharedDataStores implements IDisposable, IFluidRouter, IProvideFluidDataStoreRegistry {
    // Stores tracked by the Domain
    private readonly pendingAttach = new Map<string, IAttachMessage>();

    private readonly notBoundContexts = new Set<string>();
    // 0.24 back-compat attachingBeforeSummary
    private readonly attachOpFiredForDataStore = new Set<string>();

    // Attached and loaded context proxies
    private readonly contexts = new Map<string, FluidDataStoreContext>();
    // List of pending contexts (for the case where a client knows a store will exist and is waiting
    // on its creation). This is a superset of contexts.
    private readonly contextsDeferred = new Map<string, Deferred<FluidDataStoreContext>>();

    private _disposed = false;
    private readonly _logger: ITelemetryLogger;

    constructor(
        private readonly baseSnapshot: ISnapshotTree | undefined,
        private readonly runtime: ContainerRuntime,
        private readonly submitFn: (type: ContainerMessageType, content: any) => void,
        private readonly registry: IFluidDataStoreRegistry,
        private readonly summaryTracker: SummaryTracker,
        private readonly summarizerNode: SummarizerNodeWithGC,
        baseLogger: ITelemetryBaseLogger) {
        this._logger = ChildLogger.create(baseLogger, "DataStore");

        // Extract stores stored inside the snapshot
        const fluidDataStores = new Map<string, ISnapshotTree | string>();

        if (typeof baseSnapshot === "object") {
            Object.keys(baseSnapshot.trees).forEach((value) => {
                if (!nonDataStorePaths.includes(value)) {
                    const tree = baseSnapshot.trees[value];
                    fluidDataStores.set(value, tree);
                }
            });
        }

        // Create a context for each of them
        for (const [key, value] of fluidDataStores) {
            let dataStoreContext: FluidDataStoreContext;
            // If we have a detached container, then create local data store contexts.
            if (this.runtime.attachState !== AttachState.Detached) {
                dataStoreContext = new RemotedFluidDataStoreContext(
                    key,
                    typeof value === "string" ? value : Promise.resolve(value),
                    this.runtime,
                    this.runtime.storage,
                    this.runtime.scope,
                    this.summaryTracker.createOrGetChild(
                        key,
                        this.summaryTracker.referenceSequenceNumber),
                    this.getCreateChildSummarizerNodeFn(key, { type: CreateSummarizerNodeSource.FromSummary }));
            } else {
                let pkgFromSnapshot: string[];
                if (typeof baseSnapshot !== "object") {
                    throw new Error("Snapshot should be there to load from!!");
                }
                const snapshotTree = value as ISnapshotTree;
                // Need to rip through snapshot.
                const { pkg, snapshotFormatVersion, isRootDataStore }
                    = readAndParseFromBlobs<IFluidDataStoreAttributes>(
                        snapshotTree.blobs,
                        snapshotTree.blobs[".component"]);
                // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
                // For snapshotFormatVersion = "0.1", pkg is jsonified, otherwise it is just a string.
                // However the feature of loading a detached container from snapshot, is added when the
                // snapshotFormatVersion is "0.1", so we don't expect it to be anything else.
                if (snapshotFormatVersion === currentSnapshotFormatVersion) {
                    pkgFromSnapshot = JSON.parse(pkg) as string[];
                } else {
                    throw new Error(`Invalid snapshot format version ${snapshotFormatVersion}`);
                }

                /**
                 * If there is no isRootDataStore in the attributes blob, set it to true. This will ensure that data
                 * stores in older documents are not garbage collected incorrectly. This may lead to additional roots
                 * in the document but they won't break.
                 */
                dataStoreContext = new LocalFluidDataStoreContext(
                    key,
                    pkgFromSnapshot,
                    this.runtime,
                    this.runtime.storage,
                    this.runtime.scope,
                    this.summaryTracker.createOrGetChild(key, this.runtime.deltaManager.lastSequenceNumber),
                    this.getCreateChildSummarizerNodeFn(key, { type: CreateSummarizerNodeSource.FromSummary }),
                    (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
                    snapshotTree,
                    isRootDataStore ?? true);
            }
            this.setNewContext(key, dataStoreContext);
        }
        this.setupEvents();
    }

    private setupEvents() {
        this.runtime.on("leader",()=>{
            for (const [, context] of this.contexts) {
                context.updateLeader(this.runtime.leader);
            }
        });
        this.runtime.on("notleader",()=>{
            for (const [, context] of this.contexts) {
                context.updateLeader(this.runtime.leader);
            }
        });
    }

    public get IFluidDataStoreRegistry() {
        return this.registry;
    }

    public get IFluidRouter() {
        return this;
    }

    public async request(request: IRequest): Promise<IResponse> {
        const requestParser = RequestParser.create(request);
        const id = requestParser.pathParts[0];
        const wait =
            typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

        const dataStore = await this.getDataStore(id, wait);
        const subRequest = requestParser.createSubRequest(1);
        return dataStore.IFluidRouter.request(subRequest);
    }

    private setupNewContext(context) {
        this.verifyNotClosed();
        const id = context.id;
        assert(!this.contexts.has(id), "Creating store with existing ID");
        this.notBoundContexts.add(id);
        const deferred = new Deferred<FluidDataStoreContext>();
        this.contextsDeferred.set(id, deferred);
        this.contexts.set(id, context);
    }

    private _createFluidDataStoreContext(pkg: string[], id: string, isRoot: boolean, props?: any) {
        const context = new LocalFluidDataStoreContext(
            id,
            pkg,
            this.runtime,
            this.runtime.storage,
            this.runtime.scope,
            this.summaryTracker.createOrGetChild(id, this.runtime.deltaManager.lastSequenceNumber),
            this.getCreateChildSummarizerNodeFn(id, { type: CreateSummarizerNodeSource.Local }),
            (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
            undefined,
            isRoot,
            props,
        );
        this.setupNewContext(context);
        return context;
    }

    public async createDataStore(pkg: string | string[]): Promise<IFluidRouter> {
        return this._createDataStore(pkg, false /* isRoot */);
    }

    public async createRootDataStore(pkg: string | string[], rootDataStoreId: string): Promise<IFluidRouter> {
        const fluidDataStore = await this._createDataStore(pkg, true /* isRoot */, rootDataStoreId);
        fluidDataStore.bindToContext();
        return fluidDataStore;
    }

    public createDetachedRootDataStore(
        pkg: Readonly<string[]>,
        rootDataStoreId: string): IFluidDataStoreContextDetached
    {
        return this.createDetachedDataStoreCore(pkg, true, rootDataStoreId);
    }

    public createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached {
        return this.createDetachedDataStoreCore(pkg, false);
    }

    private createDetachedDataStoreCore(
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
            this.summaryTracker.createOrGetChild(id, this.runtime.deltaManager.lastSequenceNumber),
            this.getCreateChildSummarizerNodeFn(id, { type: CreateSummarizerNodeSource.Local }),
            (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
            undefined,
            isRoot,
        );
        this.setupNewContext(context);
        return context;
    }

    public async _createDataStoreWithProps(pkg: string | string[], props?: any, id = uuid()):
        Promise<IFluidDataStoreChannel> {
        return this._createFluidDataStoreContext(
            Array.isArray(pkg) ? pkg : [pkg], id, false /* isRoot */, props).realize();
    }

    private async _createDataStore(
        pkg: string | string[],
        isRoot: boolean,
        id = uuid(),
    ): Promise<IFluidDataStoreChannel> {
        return this._createFluidDataStoreContext(Array.isArray(pkg) ? pkg : [pkg], id, isRoot).realize();
    }

    private bindFluidDataStore(fluidDataStoreRuntime: IFluidDataStoreChannel): void {
        this.verifyNotClosed();
        assert(this.notBoundContexts.has(fluidDataStoreRuntime.id),
            "Store to be bound should be in not bounded set");
        this.notBoundContexts.delete(fluidDataStoreRuntime.id);
        const context = this.getContext(fluidDataStoreRuntime.id) as LocalFluidDataStoreContext;
        // If the container is detached, we don't need to send OP or add to pending attach because
        // we will summarize it while uploading the create new summary and make it known to other
        // clients.
        if (this.runtime.attachState !== AttachState.Detached) {
            context.emit("attaching");
            const message = context.generateAttachMessage();

            this.pendingAttach.set(fluidDataStoreRuntime.id, message);
            this.submitFn(ContainerMessageType.Attach, message);
            this.attachOpFiredForDataStore.add(fluidDataStoreRuntime.id);
        }

        // Resolve the deferred so other local stores can access it.
        const deferred = this.getContextDeferred(fluidDataStoreRuntime.id);
        deferred.resolve(context);
    }

    private ensureContextDeferred(id: string): Deferred<FluidDataStoreContext> {
        const deferred = this.contextsDeferred.get(id);
        if (deferred) { return deferred; }
        const newDeferred = new Deferred<FluidDataStoreContext>();
        this.contextsDeferred.set(id, newDeferred);
        return newDeferred;
    }

    private getContextDeferred(id: string): Deferred<FluidDataStoreContext> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const deferred = this.contextsDeferred.get(id)!;
        assert(!!deferred);
        return deferred;
    }

    private setNewContext(id: string, context: FluidDataStoreContext) {
        assert(!!context);
        assert(!this.contexts.has(id));
        this.contexts.set(id, context);
        const deferred = this.ensureContextDeferred(id);
        deferred.resolve(context);
    }

    private getContext(id: string): FluidDataStoreContext {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const context = this.contexts.get(id)!;
        assert(!!context);
        return context;
    }

    public async getRootDataStore(id: string, wait = true): Promise<IFluidRouter> {
        return this.getDataStore(id, wait);
    }

    protected async getDataStore(id: string, wait = true): Promise<IFluidRouter> {
        // Ensure deferred if it doesn't exist which will resolve once the process ID arrives
        const deferredContext = this.ensureContextDeferred(id);

        if (!wait && !deferredContext.isCompleted) {
            return Promise.reject(new Error(`DataStore ${id} does not exist`));
        }

        const context = await deferredContext.promise;
        return context.realize();
    }

    public get disposed() {return this._disposed;}
    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // close/stop all store contexts
        for (const [fluidDataStoreId, contextD] of this.contextsDeferred) {
            contextD.promise.then((context) => {
                context.dispose();
            }).catch((contextError) => {
                this._logger.sendErrorEvent({
                    eventName: "FluidDataStoreContextDisposeError",
                    fluidDataStoreId,
                    },
                    contextError);
            });
        }
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("SharedDataStores is disposed");
        }
    }

    /**
     * Notifies this object to take the snapshot of the container.
     * @deprecated - Use summarize to get summary of the container runtime.
     */
    public async snapshot(): Promise<ITree> {
        // Iterate over each store and ask it to snapshot
        const fluidDataStoreSnapshotsP = Array.from(this.contexts).map(async ([fluidDataStoreId, value]) => {
            const summaryTree = await value.summarize(true /* fullTree */, false /* trackState */);
            const summary = summaryTree.summary;
            assert(
                summary.type === SummaryType.Tree,
                "summarize should always return a tree when fullTree is true");
            // back-compat summary - Remove this once snapshot is removed.
            const snapshot = convertSummaryTreeToITree(summary);

            // If ID exists then previous commit is still valid
            return {
                fluidDataStoreId,
                snapshot,
            };
        });

        const root: ITree = { entries: [], id: null };

        // Add in module references to the store snapshots
        const fluidDataStoreSnapshots = await Promise.all(fluidDataStoreSnapshotsP);

        // Sort for better diffing of snapshots (in replay tool, used to find bugs in snapshotting logic)
        fluidDataStoreSnapshots.sort((a, b) => a.fluidDataStoreId.localeCompare(b.fluidDataStoreId));

        for (const fluidDataStoreSnapshot of fluidDataStoreSnapshots) {
            root.entries.push(new TreeTreeEntry(
                fluidDataStoreSnapshot.fluidDataStoreId,
                fluidDataStoreSnapshot.snapshot,
            ));
        }

        return root;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        for (const [fluidDataStore, context] of this.contexts) {
            try {
                context.setConnectionState(connected, clientId);
            } catch (error) {
                this._logger.sendErrorEvent({
                    eventName: "SetConnectionStateError",
                    clientId,
                    fluidDataStore,
                }, error);
            }
        }
    }

    public async summarizeInternal(
        builder: SummaryTreeBuilder,
        fullTree: boolean,
        trackState: boolean): Promise<IGraphNode[]> {
        const gcNodes: IGraphNode[] = [ this.getGCNode() ];
        // Iterate over each store and ask it to snapshot
        await Promise.all(Array.from(this.contexts)
            .filter(([_, context]) => {
                // Summarizer works only with clients with no local changes!
                assert(context.attachState !== AttachState.Attaching);
                return context.attachState === AttachState.Attached;
            }).map(async ([contextId, context]) => {
                const contextSummary = await context.summarize(fullTree, trackState);
                builder.addWithStats(contextId, contextSummary);

                // back-compat 0.30 - Older versions will not return GC nodes. Set it to empty array.
                if (contextSummary.gcNodes === undefined) {
                    contextSummary.gcNodes = [];
                }

                // Update and add the child context's GC nodes to the main list.
               gcNodes.push(... this.updateChildGCNodes(contextSummary.gcNodes, contextId));
            }));

        return gcNodes;
    }

    /**
     * Updates the garbage collection nodes of this node's children:
     * - Prefixes the child's id to the id of each node returned by the child.
     * @param childGCNodes - The child's garbage collection nodes.
     * @param childId - The id of the child node.
     * @returns the updated GC nodes of the child.
     */
    private updateChildGCNodes(childGCNodes: IGraphNode[], childId: string): IGraphNode[] {
        // Normalize the child's nodes and prefix the child's id to the ids of GC nodes returned by it.
        // This gradually builds the id of each node to be a path from the root.
        normalizeAndPrefixGCNodeIds(childGCNodes, childId);
        return childGCNodes;
    }

    /**
     * @returns this channel's garbage collection node.
     */
    private getGCNode(): IGraphNode {
        /**
         * Get the outbound routes of this channel. This will be updated to only consider root data stores
         * as referenced and hence outbound.
         */
        const outboundRoutes: string[] = [];
        for (const [contextId] of this.contexts) {
            outboundRoutes.push(`/${contextId}`);
        }

        return {
            id: "/",
            outboundRoutes,
        };
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as ISignalEnvelop;
        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: envelope.contents.content,
            type: envelope.contents.type,
        };

        if (envelope.address !== undefined) {
            const context = this.contexts.get(envelope.address);
            if (!context) {
                // Attach message may not have been processed yet
                assert(!local);
                this._logger.sendTelemetryEvent({
                    eventName: "SignalFluidDataStoreNotFound",
                    fluidDataStoreId: envelope.address,
                });
                return;
            }

            context.processSignal(transformed, local);
        }
    }

    public processAttachMessage(message: ISequencedDocumentMessage, local: boolean) {
        const attachMessage = message.contents as InboundAttachMessage;
        // The local object has already been attached
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.contexts.get(attachMessage.id)?.emit("attached");
            this.pendingAttach.delete(attachMessage.id);
            return;
        }

         // If a non-local operation then go and create the object, otherwise mark it as officially attached.
        if (this.contexts.has(attachMessage.id)) {
            const error = new Error("DataCorruption: Duplicate data store created with existing ID");
            this._logger.sendErrorEvent({
                eventName: "DuplicateDataStoreId",
                sequenceNumber: message.sequenceNumber,
                clientId: message.clientId,
                referenceSequenceNumber: message.referenceSequenceNumber,
            }, error);
            throw error;
        }

        const flatBlobs = new Map<string, string>();
        let flatBlobsP = Promise.resolve(flatBlobs);
        let snapshotTreeP: Promise<ISnapshotTree> | null = null;
        if (attachMessage.snapshot) {
            snapshotTreeP = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
            // flatBlobs' validity is contingent on snapshotTreeP's resolution
            flatBlobsP = snapshotTreeP.then(() => { return flatBlobs; });
        }

        // Include the type of attach message which is the pkg of the store to be
        // used by RemotedFluidDataStoreContext in case it is not in the snapshot.
        const pkg = [attachMessage.type];
        const remotedFluidDataStoreContext = new RemotedFluidDataStoreContext(
            attachMessage.id,
            snapshotTreeP,
            this.runtime,
            new BlobCacheStorageService(this.runtime.storage, flatBlobsP),
            this.runtime.scope,
            this.summaryTracker.createOrGetChild(attachMessage.id, message.sequenceNumber),
            this.getCreateChildSummarizerNodeFn(
                attachMessage.id,
                {
                    type: CreateSummarizerNodeSource.FromAttach,
                    sequenceNumber: message.sequenceNumber,
                    snapshot: attachMessage.snapshot ?? {
                        id: null,
                        entries: [createAttributesBlob(pkg, true /* isRootDataStore */)],
                    },
                }),
            pkg);

        // Resolve pending gets and store off any new ones
        this.setNewContext(attachMessage.id, remotedFluidDataStoreContext);

        // Equivalent of nextTick() - Prefetch once all current ops have completed
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(async () => remotedFluidDataStoreContext.realize());
    }

    public processFluidDataStoreOp(message: ISequencedDocumentMessage, local: boolean, localMessageMetadata: unknown) {
        const envelope = message.contents as IEnvelope;
        const transformed = { ...message, contents: envelope.contents };
        const context = this.getContext(envelope.address);
        context.process(transformed, local, localMessageMetadata);
    }

    public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
        let eventName: string;
        if (attachState === AttachState.Attaching) {
            assert(this.runtime.attachState === AttachState.Attaching,
                "Container Context should already be in attaching state");
            eventName = "attaching";
        } else {
            assert(this.runtime.attachState === AttachState.Attached,
                 "Container Context should already be in attached state");
            eventName = "attached";
        }
        for (const context of this.contexts.values()) {
            // Fire only for bounded stores.
            if (!this.notBoundContexts.has(context.id)) {
                context.emit(eventName);
            }
        }
    }

    public createSummary(builder: SummaryTreeBuilder) {
        // Attaching graph of some stores can cause other stores to get bound too.
        // So keep taking summary until no new stores get bound.
        let notBoundContextsLength: number;
        do {
            const builderTree = builder.summary.tree;
            notBoundContextsLength = this.notBoundContexts.size;
            // Iterate over each data store and ask it to snapshot
            Array.from(this.contexts)
                .filter(([key, _]) =>
                    // Take summary of bounded data stores only, make sure we haven't summarized them already
                    // and no attach op has been fired for that data store because for loader versions <= 0.24
                    // we set attach state as "attaching" before taking createNew summary.
                    !(this.notBoundContexts.has(key)
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
                            "BaseSnapshot should be there as detached container loaded from snapshot");
                        dataStoreSummary = convertSnapshotTreeToSummaryTree(this.baseSnapshot.trees[key]);
                    }
                    builder.addWithStats(key, dataStoreSummary);
                });
        } while (notBoundContextsLength !== this.notBoundContexts.size);
    }

    public resubmitDataStoreOp(content: any, localOpMetadata: unknown) {
        const envelope = content as IEnvelope;
        const context = this.getContext(envelope.address);
        assert(!!context, "There should be a store context for the op");
        context.reSubmit(envelope.contents, localOpMetadata);
    }

    private getCreateChildSummarizerNodeFn(id: string, createParam: CreateChildSummarizerNodeParam) {
        return (summarizeInternal: SummarizeInternalFn) => this.summarizerNode.createChild(
            summarizeInternal,
            id,
            createParam,
        );
    }
}
