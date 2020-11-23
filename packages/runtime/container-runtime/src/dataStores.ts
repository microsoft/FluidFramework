import { ITelemetryLogger, ITelemetryBaseLogger, IDisposable } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    CreateChildSummarizerNodeFn,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
    IAttachMessage,
    IFluidDataStoreChannel,
    IFluidDataStoreContextDetached,
} from "@fluidframework/runtime-definitions";
import { SummaryTracker } from "@fluidframework/runtime-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { BlobCacheStorageService, buildSnapshotTree, readAndParseFromBlobs } from "@fluidframework/driver-utils";
import { assert, Lazy } from "@fluidframework/common-utils";
import uuid from "uuid";
import { DataStoreContexts } from "./dataStoreContexts";
import { ContainerRuntime, nonDataStorePaths } from "./containerRuntime";
import {
    FluidDataStoreContext,
    RemotedFluidDataStoreContext,
    IFluidDataStoreAttributes,
    currentSnapshotFormatVersion,
    LocalFluidDataStoreContext,
    createAttributesBlob,
    LocalDetachedFluidDataStoreContext,
 } from "./dataStoreContext";

export class DataStores implements IDisposable {
    // Stores tracked by the Domain
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    // 0.24 back-compat attachingBeforeSummary
    public readonly attachOpFiredForDataStore = new Set<string>();

    private readonly logger: ITelemetryLogger;

    private readonly disposeOnce = new Lazy<void>(()=>this.contexts.dispose());

    constructor(
        baseSnapshot: ISnapshotTree | undefined,
        private readonly runtime: ContainerRuntime,
        private readonly submitAttachFn: (attachContent: any) => void,
        private readonly summaryTracker: SummaryTracker,
        private readonly getCreateChildSummarizerNodeFn:
            (id: string, createParam: CreateChildSummarizerNodeParam)  => CreateChildSummarizerNodeFn,
        baseLogger: ITelemetryBaseLogger,
        public readonly contexts: DataStoreContexts = new DataStoreContexts(baseLogger),
        ) {
        this.logger = ChildLogger.create(baseLogger);
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
                    this.summaryTracker.createOrGetChild(key, this.summaryTracker.referenceSequenceNumber),
                    this.getCreateChildSummarizerNodeFn(key, { type: CreateSummarizerNodeSource.FromSummary }));
            } else {
                let pkgFromSnapshot: string[];
                if (typeof value !== "object") {
                    throw new Error("Snapshot should be there to load from!!");
                }
                const snapshotTree = value;
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
            this.contexts.setNew(key, dataStoreContext);
        }
    }

    public processAttachMessage(message: ISequencedDocumentMessage, local: boolean) {
        const attachMessage = message.contents;
        // The local object has already been attached
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.contexts.tryGet(attachMessage.id)?.emit("attached");
            this.pendingAttach.delete(attachMessage.id);
            return;
        }

         // If a non-local operation then go and create the object, otherwise mark it as officially attached.
        if (this.contexts.has(attachMessage.id)) {
            const error = new Error("DataCorruption: Duplicate data store created with existing ID");
            this.logger.sendErrorEvent({
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
       this.contexts.setNew(attachMessage.id, remotedFluidDataStoreContext);

        // Equivalent of nextTick() - Prefetch once all current ops have completed
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(async () => remotedFluidDataStoreContext.realize());
    }

    public  bindFluidDataStore(fluidDataStoreRuntime: IFluidDataStoreChannel): void {
        assert(this.contexts.notBoundContexts.has(fluidDataStoreRuntime.id),
            "Store to be bound should be in not bounded set");
        this.contexts.notBoundContexts.delete(fluidDataStoreRuntime.id);
        const context = this.contexts.get(fluidDataStoreRuntime.id) as LocalFluidDataStoreContext;
        // If the container is detached, we don't need to send OP or add to pending attach because
        // we will summarize it while uploading the create new summary and make it known to other
        // clients.
        if (this.runtime.attachState !== AttachState.Detached) {
            context.emit("attaching");
            const message = context.generateAttachMessage();

            this.pendingAttach.set(fluidDataStoreRuntime.id, message);
            this.submitAttachFn(message);
            this.attachOpFiredForDataStore.add(fluidDataStoreRuntime.id);
        }

        // Resolve the deferred so other local stores can access it.
        const deferred = this.contexts.getDeferred(fluidDataStoreRuntime.id);
        deferred.resolve(context);
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
            this.summaryTracker.createOrGetChild(id, this.runtime.deltaManager.lastSequenceNumber),
            this.getCreateChildSummarizerNodeFn(id, { type: CreateSummarizerNodeSource.Local }),
            (cr: IFluidDataStoreChannel) => this.bindFluidDataStore(cr),
            undefined,
            isRoot,
        );
        this.contexts.setupNew(context);
        return context;
    }

    public _createFluidDataStoreContext(pkg: string[], id: string, isRoot: boolean, props?: any) {
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
        this.contexts.setupNew(context);
        return context;
    }

    public get disposed() {return this.disposeOnce.evaluated;}
    public readonly dispose = () => this.disposeOnce.value;
}
