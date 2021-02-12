/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { TaskManagerFactory } from "@fluidframework/agent-scheduler";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IFluidRouter,
    IFluidHandleContext,
    IFluidSerializer,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IFluidTokenProvider,
    IContainerContext,
    IDeltaManager,
    IDeltaSender,
    ILoader,
    IRuntime,
    IRuntimeState,
    ContainerWarning,
    ICriticalContainerError,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import {
    IContainerRuntime,
    IContainerRuntimeDirtyable,
    IContainerRuntimeEvents,
} from "@fluidframework/container-runtime-definitions";
import {
    assert,
    Deferred,
    Trace,
    TypedEventEmitter,
    unreachableCase,
} from "@fluidframework/common-utils";
import {
    ChildLogger,
    raiseConnectedEvent,
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    readAndParse,
    readAndParseFromBlobs,
} from "@fluidframework/driver-utils";
import { CreateContainerError } from "@fluidframework/container-utils";
import { runGarbageCollection } from "@fluidframework/garbage-collector";
import {
    BlobTreeEntry,
} from "@fluidframework/protocol-base";
import {
    IClientDetails,
    IDocumentMessage,
    IHelpMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryConfiguration,
    ISummaryContent,
    ISummaryTree,
    ITree,
    MessageType,
    IVersion,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    FlushMode,
    InboundAttachMessage,
    IFluidDataStoreContext,
    IFluidDataStoreContextDetached,
    IFluidDataStoreRegistry,
    IFluidDataStoreChannel,
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
    IEnvelope,
    IInboundSignalMessage,
    ISignalEnvelope,
    NamedFluidDataStoreRegistryEntries,
    ISummaryStats,
    ISummaryTreeWithStats,
    ISummarizeInternalResult,
    IAgentScheduler,
    ITaskManager,
    IChannelSummarizeResult,
    CreateChildSummarizerNodeParam,
    SummarizeInternalFn,
} from "@fluidframework/runtime-definitions";
import {
    addBlobToSummary,
    addTreeToSummary,
    convertToSummaryTree,
    createRootSummarizerNodeWithGC,
    FluidSerializer,
    IRootSummarizerNodeWithGC,
    requestFluidObject,
    RequestParser,
} from "@fluidframework/runtime-utils";
import { v4 as uuid } from "uuid";
import { ContainerFluidHandleContext } from "./containerHandleContext";
import { FluidDataStoreRegistry } from "./dataStoreRegistry";
import { debug } from "./debug";
import { ISummarizerRuntime, ISummarizerInternalsProvider, Summarizer } from "./summarizer";
import { SummaryManager } from "./summaryManager";
import { analyzeTasks } from "./taskAnalyzer";
import { DeltaScheduler } from "./deltaScheduler";
import { ReportOpPerfTelemetry } from "./connectionTelemetry";
import { SummaryCollection } from "./summaryCollection";
import { PendingStateManager } from "./pendingStateManager";
import { pkgVersion } from "./packageVersion";
import { BlobManager } from "./blobManager";
import { DataStores, getSnapshotForDataStores } from "./dataStores";
import {
    blobsTreeName,
    chunksBlobName,
    IContainerRuntimeMetadata,
    metadataBlobName,
} from "./snapshot";

export enum ContainerMessageType {
    // An op to be delivered to store
    FluidDataStoreOp = "component",

    // Creates a new store
    Attach = "attach",

    // Chunked operation.
    ChunkedOp = "chunkedOp",

    BlobAttach = "blobAttach",
}

export interface IChunkedOp {
    chunkId: number;

    totalChunks: number;

    contents: string;

    originalType: MessageType | ContainerMessageType;
}

export interface ContainerRuntimeMessage {
    contents: any;
    type: ContainerMessageType;
}

export interface IPreviousState {
    summaryCollection?: SummaryCollection,
    reload?: boolean,

    // only one (or zero) of these will be defined. the summarizing Summarizer will resolve the deferred promise, and
    // the SummaryManager that spawned it will have that deferred's promise
    nextSummarizerP?: Promise<Summarizer>,
    nextSummarizerD?: Deferred<Summarizer>,
}

export interface IGeneratedSummaryData {
    readonly summaryStats: ISummaryStats;
    readonly generateDuration?: number;
}

export interface IUploadedSummaryData {
    readonly handle: string;
    readonly uploadDuration?: number;
}

export interface IUnsubmittedSummaryData extends Partial<IGeneratedSummaryData>, Partial<IUploadedSummaryData> {
    readonly referenceSequenceNumber: number;
    readonly submitted: false;
    readonly reason: "disconnected";
}

export interface ISubmittedSummaryData extends IGeneratedSummaryData, IUploadedSummaryData {
    readonly referenceSequenceNumber: number;
    readonly submitted: true;
    readonly clientSequenceNumber: number;
    readonly submitOpDuration?: number;
}

export type GenerateSummaryData = IUnsubmittedSummaryData | ISubmittedSummaryData;

// Consider idle 5s of no activity. And snapshot if a minute has gone by with no snapshot.
const IdleDetectionTime = 5000;

const DefaultSummaryConfiguration: ISummaryConfiguration = {
    idleTime: IdleDetectionTime,

    maxTime: IdleDetectionTime * 12,

    // Snapshot if 1000 ops received since last snapshot.
    maxOps: 1000,

    // Wait 2 minutes for summary ack
    maxAckWaitTime: 120000,
};

/**
 * Options for container runtime.
 */
export interface IContainerRuntimeOptions {
    // Flag that will generate summaries if connected to a service that supports them.
    // This defaults to true and must be explicitly set to false to disable.
    generateSummaries?: boolean;

    // Experimental flag that will execute tasks in web worker if connected to a service that supports them.
    enableWorker?: boolean;

    // Delay before first attempt to spawn summarizing container
    initialSummarizerDelayMs?: number;

    // Flag that will disable garbage collection if set to true.
    disableGC?: boolean;

    // Flag that will bypass optimizations and generate GC data for all nodes irrespective of whether the node
    // changed or not.
    runFullGC?: boolean;

    // Override summary configurations
    summaryConfigOverrides?: Partial<ISummaryConfiguration>;
}

interface IRuntimeMessageMetadata {
    batch?: boolean;
}

export function isRuntimeMessage(message: ISequencedDocumentMessage): boolean {
    switch (message.type) {
        case ContainerMessageType.FluidDataStoreOp:
        case ContainerMessageType.ChunkedOp:
        case ContainerMessageType.Attach:
        case ContainerMessageType.BlobAttach:
        case MessageType.Operation:
            return true;
        default:
            return false;
    }
}

export function unpackRuntimeMessage(message: ISequencedDocumentMessage) {
    if (message.type === MessageType.Operation) {
        // legacy op format?
        if (message.contents.address !== undefined && message.contents.type === undefined) {
            message.type = ContainerMessageType.FluidDataStoreOp;
        } else {
            // new format
            const innerContents = message.contents as ContainerRuntimeMessage;
            assert(innerContents.type !== undefined);
            message.type = innerContents.type;
            message.contents = innerContents.contents;
        }
        assert(isRuntimeMessage(message));
    } else {
        // Legacy format, but it's already "unpacked",
        // i.e. message.type is actually ContainerMessageType.
        // Nothing to do in such case.
    }
    return message;
}

export class ScheduleManager {
    private readonly deltaScheduler: DeltaScheduler;
    private pauseSequenceNumber: number | undefined;
    private pauseClientId: string | undefined;
    private localPaused = false;
    private batchClientId: string | undefined;

    constructor(
        private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly emitter: EventEmitter,
        private readonly logger: ITelemetryLogger,
    ) {
        this.deltaScheduler = new DeltaScheduler(
            this.deltaManager,
            ChildLogger.create(this.logger, "DeltaScheduler"),
        );

        // Listen for delta manager sends and add batch metadata to messages
        this.deltaManager.on("prepareSend", (messages: IDocumentMessage[]) => {
            if (messages.length === 0) {
                return;
            }

            // First message will have the batch flag set to true if doing a batched send
            const firstMessageMetadata = messages[0].metadata as IRuntimeMessageMetadata;
            if (!firstMessageMetadata || !firstMessageMetadata.batch) {
                return;
            }

            // If the batch contains only a single op, clear the batch flag.
            if (messages.length === 1) {
                delete firstMessageMetadata.batch;
                return;
            }

            // Set the batch flag to false on the last message to indicate the end of the send batch
            const lastMessage = messages[messages.length - 1];
            lastMessage.metadata = { ...lastMessage.metadata, batch: false };
        });

        // Listen for updates and peek at the inbound
        this.deltaManager.inbound.on(
            "push",
            (message: ISequencedDocumentMessage) => {
                this.trackPending(message);
                this.updatePauseState(message.sequenceNumber);
            });

        const allPending = this.deltaManager.inbound.toArray();
        for (const pending of allPending) {
            this.trackPending(pending);
        }

        // Based on track pending update the pause state
        this.updatePauseState(this.deltaManager.lastSequenceNumber);
    }

    public beginOperation(message: ISequencedDocumentMessage) {
        if (this.batchClientId !== message.clientId) {
            // As a back stop for any bugs marking the end of a batch - if the client ID flipped, we
            // consider the previous batch over.
            if (this.batchClientId) {
                this.emitter.emit("batchEnd", "Did not receive real batchEnd message", undefined);
                this.deltaScheduler.batchEnd();

                this.logger.sendTelemetryEvent({
                    eventName: "BatchEndNotReceived",
                    clientId: this.batchClientId,
                    sequenceNumber: message.sequenceNumber,
                });
            }

            // This could be the beginning of a new batch or an individual message.
            this.emitter.emit("batchBegin", message);
            this.deltaScheduler.batchBegin();

            const batch = (message?.metadata as IRuntimeMessageMetadata)?.batch;
            if (batch) {
                this.batchClientId = message.clientId;
            } else {
                this.batchClientId = undefined;
            }
        }
    }

    public endOperation(error: any | undefined, message: ISequencedDocumentMessage) {
        if (error) {
            this.batchClientId = undefined;
            this.emitter.emit("batchEnd", error, message);
            this.deltaScheduler.batchEnd();
            return;
        }

        this.updatePauseState(message.sequenceNumber);

        const batch = (message?.metadata as IRuntimeMessageMetadata)?.batch;
        // If no batchClientId has been set then we're in an individual batch. Else, if we get
        // batch end metadata, this is end of the current batch.
        if (!this.batchClientId || batch === false) {
            this.batchClientId = undefined;
            this.emitter.emit("batchEnd", undefined, message);
            this.deltaScheduler.batchEnd();
            return;
        }
    }

    private setPaused(localPaused: boolean) {
        // Return early if no change in value
        if (this.localPaused === localPaused) {
            return;
        }

        this.localPaused = localPaused;
        if (localPaused) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.deltaManager.inbound.pause();
        } else {
            this.deltaManager.inbound.resume();
        }
    }

    private updatePauseState(sequenceNumber: number) {
        // If the inbound queue is ever empty we pause it and wait for new events
        if (this.deltaManager.inbound.length === 0) {
            this.setPaused(true);
            return;
        }

        // If no message has caused the pause flag to be set, or the next message up is not the one we need to pause at
        // then we simply continue processing
        if (!this.pauseSequenceNumber || sequenceNumber + 1 < this.pauseSequenceNumber) {
            this.setPaused(false);
        } else {
            // Otherwise the next message requires us to pause
            this.setPaused(true);
        }
    }

    private trackPending(message: ISequencedDocumentMessage) {
        const metadata = message.metadata as IRuntimeMessageMetadata | undefined;

        // Protocol messages are never part of a runtime batch of messages
        if (!isRuntimeMessage(message)) {
            this.pauseSequenceNumber = undefined;
            this.pauseClientId = undefined;
            return;
        }

        const batchMetadata = metadata ? metadata.batch : undefined;

        // If the client ID changes then we can move the pause point. If it stayed the same then we need to check.
        if (this.pauseClientId === message.clientId) {
            if (batchMetadata !== undefined) {
                // If batchMetadata is not undefined then if it's true we've begun a new batch - if false we've ended
                // the previous one
                this.pauseSequenceNumber = batchMetadata ? message.sequenceNumber : undefined;
                this.pauseClientId = batchMetadata ? this.pauseClientId : undefined;
            }
        } else {
            // We check the batch flag for the new clientID - if true we pause otherwise we reset the tracking data
            this.pauseSequenceNumber = batchMetadata ? message.sequenceNumber : undefined;
            this.pauseClientId = batchMetadata ? message.clientId : undefined;
        }
    }
}

export const taskSchedulerId = "_scheduler";

// Wraps the provided list of packages and augments with some system level services.
class ContainerRuntimeDataStoreRegistry extends FluidDataStoreRegistry {
    constructor(namedEntries: NamedFluidDataStoreRegistryEntries) {
        super([
            ...namedEntries,
            TaskManagerFactory.registryEntry,
        ]);
    }
}

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 * It will define the store level mappings.
 */
export class ContainerRuntime extends TypedEventEmitter<IContainerRuntimeEvents>
    implements
        IContainerRuntime,
        IContainerRuntimeDirtyable,
        IRuntime,
        ISummarizerRuntime,
        ISummarizerInternalsProvider
{
    public get IContainerRuntime() { return this; }
    public get IContainerRuntimeDirtyable() { return this; }
    public get IFluidRouter() { return this; }

    // 0.24 back-compat attachingBeforeSummary
    public readonly runtimeVersion = pkgVersion;

    /**
     * Load the stores from a snapshot and returns the runtime.
     * @param context - Context of the container.
     * @param registry - Mapping to the stores.
     * @param requestHandlers - Request handlers for the container runtime
     * @param runtimeOptions - Additional options to be passed to the runtime
     */
    public static async load(
        context: IContainerContext,
        registryEntries: NamedFluidDataStoreRegistryEntries,
        requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>,
        runtimeOptions?: IContainerRuntimeOptions,
        containerScope: IFluidObject = context.scope,
    ): Promise<ContainerRuntime> {
        // Back-compat: <= 0.18 loader
        if (context.deltaManager.lastSequenceNumber === undefined) {
            Object.defineProperty(context.deltaManager, "lastSequenceNumber", {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                get: () => (context.deltaManager as any).referenceSequenceNumber,
            });
        }

        const registry = new ContainerRuntimeDataStoreRegistry(registryEntries);

        const tryFetchBlob = async <T>(blobName: string): Promise<T | undefined> => {
            const blobId = context.baseSnapshot?.blobs[blobName];
            if (context.baseSnapshot && blobId) {
                return context.storage ?
                    readAndParse<T>(context.storage, blobId) :
                    readAndParseFromBlobs<T>(context.baseSnapshot.blobs, blobId);
            }
        };
        const chunks = await tryFetchBlob<[string, string[]][]>(chunksBlobName) ?? [];
        const metadata = await tryFetchBlob<IContainerRuntimeMetadata>(metadataBlobName);

        const runtime = new ContainerRuntime(
            context,
            registry,
            metadata,
            chunks,
            runtimeOptions,
            containerScope,
            requestHandler);

        // Create all internal data stores if not already existing on storage or loaded a detached
        // container from snapshot(ex. draft mode).
        if (!context.existing) {
            await runtime.createRootDataStore(TaskManagerFactory.type, taskSchedulerId);
        }

        runtime.subscribeToLeadership();

        return runtime;
    }

    public get id(): string {
        return this.context.id;
    }

    public get existing(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.existing!;
    }

    public get options(): ILoaderOptions {
        return this.context.options;
    }

    public get clientId(): string | undefined {
        return this.context.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.context.clientDetails;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.context.deltaManager;
    }

    public get storage(): IDocumentStorageService {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.storage!;
    }

    public get branch(): string {
        return this.context.branch;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.context.snapshotFn;
    }

    public get reSubmitFn(): (
        type: ContainerMessageType,
        content: any,
        localOpMetadata: unknown,
        opMetadata: Record<string, unknown> | undefined,
    ) => void {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        return this.reSubmit;
    }

    public get closeFn(): (error?: ICriticalContainerError) => void {
        return this.context.closeFn;
    }

    public get loader(): ILoader {
        return this.context.loader;
    }

    public get flushMode(): FlushMode {
        return this._flushMode;
    }

    public get scope(): IFluidObject {
        return this.containerScope;
    }

    public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
        return this.registry;
    }

    public get attachState(): AttachState {
        if (this.context.attachState !== undefined) {
            return this.context.attachState;
        }
        // 0.21 back-compat isAttached
        return (this.context as any).isAttached() ? AttachState.Attached : AttachState.Detached;
    }

    public nextSummarizerP?: Promise<Summarizer>;
    public nextSummarizerD?: Deferred<Summarizer>;

    // Back compat: 0.28, can be removed in 0.29
    public readonly IFluidSerializer: IFluidSerializer;

    public readonly IFluidHandleContext: IFluidHandleContext;

    // internal logger for ContainerRuntime
    private readonly _logger: ITelemetryLogger;
    // publicly visible logger, to be used by stores, summarize, etc.
    public readonly logger: ITelemetryLogger;
    public readonly previousState: IPreviousState;
    private readonly summaryManager: SummaryManager;
    private latestSummaryAck: ISummaryContext;

    private readonly summarizerNode: IRootSummarizerNodeWithGC;

    private tasks: string[] = [];

    // Back-compat: version decides between loading document and chaincode.
    private version: string | undefined;

    private _flushMode = FlushMode.Automatic;
    private needsFlush = false;
    private flushTrigger = false;

    // Always matched IAgentScheduler.leader property
    private _leader = false;

    private _connected: boolean;

    public get connected(): boolean {
        return this._connected;
    }

    public get leader(): boolean {
        return this._leader;
    }

    public get summarizerClientId(): string | undefined {
        return this.summaryManager.summarizer;
    }

    private get summaryConfiguration() {
        return  {
            ... DefaultSummaryConfiguration,
            ... this.context?.serviceConfiguration?.summary,
            ... this.runtimeOptions.summaryConfigOverrides,
         };
    }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    private dirtyDocument = false;
    private emitDirtyDocumentEvent = true;
    private readonly summarizer: Summarizer;
    private readonly deltaSender: IDeltaSender | undefined;
    private readonly scheduleManager: ScheduleManager;
    private readonly blobManager: BlobManager;
    private readonly pendingStateManager: PendingStateManager;

    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    private readonly dataStores: DataStores;

    private constructor(
        private readonly context: IContainerContext,
        private readonly registry: IFluidDataStoreRegistry,
        metadata: IContainerRuntimeMetadata = { snapshotFormatVersion: undefined },
        chunks: [string, string[]][],
        private readonly runtimeOptions: IContainerRuntimeOptions = {
            generateSummaries: true,
            enableWorker: false,
        },
        private readonly containerScope: IFluidObject,
        private readonly requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>,
    ) {
        super();

        this._connected = this.context.connected;
        this.chunkMap = new Map<string, string[]>(chunks);

        this.IFluidHandleContext = new ContainerFluidHandleContext("", this);
        this.IFluidSerializer = new FluidSerializer(this.IFluidHandleContext);

        this.logger = ChildLogger.create(context.logger, undefined, {
            runtimeVersion: pkgVersion,
        });

        this._logger = ChildLogger.create(this.logger, "ContainerRuntime");

        this.latestSummaryAck = {
            proposalHandle: undefined,
            ackHandle: this.context.getLoadedFromVersion()?.id,
        };

        const loadedFromSequenceNumber = this.deltaManager.initialSequenceNumber;
        this.summarizerNode = createRootSummarizerNodeWithGC(
            this.logger,
            // Summarize function to call when summarize is called. Summarizer node always tracks summary state.
            async (fullTree: boolean, trackState: boolean) => this.summarizeInternal(fullTree, trackState),
            // Latest change sequence number, no changes since summary applied yet
            loadedFromSequenceNumber,
            // Summary reference sequence number, undefined if no summary yet
            context.baseSnapshot ? loadedFromSequenceNumber : undefined,
            {
                // Must set to false to prevent sending summary handle which would be pointing to
                // a summary with an older protocol state.
                canReuseHandle: false,
                // Must set to true to throw on any data stores failure that was too severe to be handled.
                // We also are not decoding the base summaries at the root.
                throwOnFailure: true,
                // If GC is disabled, let the summarizer node know so that it does not track GC state.
                gcDisabled: this.runtimeOptions.disableGC,
            },
        );

        this.dataStores = new DataStores(
            getSnapshotForDataStores(context.baseSnapshot, metadata.snapshotFormatVersion),
            this,
            (attachMsg) => this.submit(ContainerMessageType.Attach, attachMsg),
            (id: string, createParam: CreateChildSummarizerNodeParam) => (
                    summarizeInternal: SummarizeInternalFn,
                    getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
                    getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
                ) => this.summarizerNode.createChild(
                    summarizeInternal,
                    id,
                    createParam,
                    undefined,
                    getGCDataFn,
                    getInitialGCSummaryDetailsFn,
                ),
            this._logger);

        this.blobManager = new BlobManager(
            this.IFluidHandleContext,
            () => this.storage,
            (blobId) => this.submit(ContainerMessageType.BlobAttach, undefined, undefined, { blobId }),
        );
        this.blobManager.load(context.baseSnapshot?.trees[blobsTreeName]);

        this.scheduleManager = new ScheduleManager(
            context.deltaManager,
            this,
            ChildLogger.create(this.logger, "ScheduleManager"),
        );

        this.deltaSender = this.deltaManager;

        this.pendingStateManager = new PendingStateManager(this);

        this.context.quorum.on("removeMember", (clientId: string) => {
            this.clearPartialChunks(clientId);
        });

        this.context.quorum.on("addProposal", (proposal) => {
            if (proposal.key === "code" || proposal.key === "code2") {
                this.emit("codeDetailsProposed", proposal.value, proposal);
            }
        });

        if (this.context.previousRuntimeState === undefined || this.context.previousRuntimeState.state === undefined) {
            this.previousState = {};
        } else {
            this.previousState = this.context.previousRuntimeState.state as IPreviousState;
        }

        // We always create the summarizer in the case that we are asked to generate summaries. But this may
        // want to be on demand instead.
        // Don't use optimizations when generating summaries with a document loaded using snapshots.
        // This will ensure we correctly convert old documents.
        this.summarizer = new Summarizer(
            "/_summarizer",
            this /* ISummarizerRuntime */,
            () => this.summaryConfiguration,
            this /* ISummarizerInternalsProvider */,
            this.IFluidHandleContext,
            this.previousState.summaryCollection);

        // Create the SummaryManager and mark the initial state
        this.summaryManager = new SummaryManager(
            context,
            this.runtimeOptions.generateSummaries !== false,
            !!this.runtimeOptions.enableWorker,
            this.logger,
            (summarizer) => { this.nextSummarizerP = summarizer; },
            this.previousState.nextSummarizerP,
            !!this.previousState.reload,
            this.runtimeOptions.initialSummarizerDelayMs);

        if (this.connected) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.summaryManager.setConnected(this.context.clientId!);
        }

        this.deltaManager.on("readonly", (readonly: boolean) => {
            // we accumulate ops while being in read-only state.
            // once user gets write permissions and we have active connection, flush all pending ops.
            assert(readonly === this.deltaManager.readonly, "inconsistent readonly property/event state");

            // We need to be very careful with when we (re)send pending ops, to ensure that we only send ops
            // when we either never send an op, or attempted to send it but we know for sure it was not
            // sequenced by server and will never be sequenced (i.e. was lost)
            // For loss of connection, we wait for our own "join" op and use it a a barrier to know all the
            // ops that made it from previous connection, before switching clientId and raising "connected" event
            // But with read-only permissions, if we transition between read-only and r/w states while on same
            // connection, then we have no good signal to tell us when it's safe to send ops we accumulated while
            // being in read-only state.
            // For that reason, we support getting to read-only state only when disconnected. This ensures that we
            // can rely on same safety mechanism and resend ops only when we establish new connection.
            // This is applicable for read-only permissions (event is raised before connection is properly registered),
            // but it's an extra requirement for Container.forceReadonly() API
            assert(!readonly || !this.connected, "Unsafe to transition to read-only state!");

            this.replayPendingStates();
        });

        ReportOpPerfTelemetry(this.context.clientId, this.deltaManager, this.logger);
    }

    public dispose(error?: Error): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.logger.sendTelemetryEvent({
            eventName: "ContainerRuntimeDisposed",
            category: "generic",
            isDirty: this.isDocumentDirty(),
            lastSequenceNumber: this.deltaManager.lastSequenceNumber,
            attachState: this.attachState,
            message: error?.message,
        });

        this.summaryManager.dispose();
        this.summarizer.dispose();

        this.dataStores.dispose();

        this.emit("dispose");
        this.removeAllListeners();
    }

    public get IFluidTokenProvider() {
        if (this.options && this.options.intelligence) {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            return {
                intelligence: this.options.intelligence,
            } as IFluidTokenProvider;
        }
        return undefined;
    }

    public get IFluidConfiguration() {
        return this.context.configuration;
    }

    /**
     * Notifies this object about the request made to the container.
     * @param request - Request made to the handler.
     */
    public async request(request: IRequest): Promise<IResponse> {
        const parser = RequestParser.create(request);
        const id = parser.pathParts[0];

        if (id === "_summarizer" && parser.pathParts.length === 1) {
            return {
                status: 200,
                mimeType: "fluid/object",
                value: this.summarizer,
            };
        }
        if (this.requestHandler !== undefined) {
            return this.requestHandler(parser, this);
        }

        return {
            status: 404,
            mimeType: "text/plain",
            value: "resource not found",
        };
    }

    /**
     * Resolves URI representing handle
     * @param request - Request made to the handler.
     */
    public async resolveHandle(request: IRequest): Promise<IResponse> {
        const requestParser = RequestParser.create(request);
        const id = requestParser.pathParts[0];

        if (id === "_channels") {
            return this.resolveHandle(requestParser.createSubRequest(1));
        }

        if (id === BlobManager.basePath && requestParser.isLeaf(2)) {
            const handle = await this.blobManager.getBlob(requestParser.pathParts[1]);
            if (handle) {
                return {
                    status: 200,
                    mimeType: "fluid/object",
                    value: handle.get(),
                };
            } else {
                return {
                    status: 404,
                    mimeType: "text/plain",
                    value: "blob not found",
                };
            }
        } else if (requestParser.pathParts.length > 0) {
            const wait =
                typeof request.headers?.wait === "boolean" ? request.headers.wait : undefined;

            const dataStore = await this.getDataStore(id, wait);
            const subRequest = requestParser.createSubRequest(1);
            // We always expect createSubRequest to include a leading slash, but asserting here to protect against
            // unintentionally modifying the url if that changes.
            assert(subRequest.url.startsWith("/"), "Expected createSubRequest url to include a leading slash");
            return dataStore.IFluidRouter.request(subRequest);
        }

        return {
            status: 404,
            mimeType: "text/plain",
            value: "resource not found",
        };
    }

    /**
     * Notifies this object to take the snapshot of the container.
     * @deprecated - Use summarize to get summary of the container runtime.
     */
    public async snapshot(): Promise<ITree> {
        const root: ITree = { entries: await this.dataStores.snapshot() };

        if (this.chunkMap.size > 0) {
            root.entries.push(new BlobTreeEntry(chunksBlobName, JSON.stringify([...this.chunkMap])));
        }

        return root;
    }

    private addContainerBlobsToSummary(summaryTree: ISummaryTreeWithStats) {
        if (this.chunkMap.size > 0) {
            const content = JSON.stringify([...this.chunkMap]);
            addBlobToSummary(summaryTree, chunksBlobName, content);
        }
        const blobsTree = convertToSummaryTree(this.blobManager.snapshot(), false);
        addTreeToSummary(summaryTree, blobsTreeName, blobsTree);
    }

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.context.requestSnapshot(tagMessage);
    }

    public async stop(): Promise<IRuntimeState> {
        this.verifyNotClosed();

        const snapshot = await this.snapshot();
        const state: IPreviousState = {
            reload: true,
            summaryCollection: this.summarizer.summaryCollection,
            nextSummarizerP: this.nextSummarizerP,
            nextSummarizerD: this.nextSummarizerD,
        };

        this.dispose(new Error("ContainerRuntimeStopped"));

        return { snapshot, state };
    }

    private replayPendingStates() {
        // We need to be able to send ops to replay states
        if (!this.canSendOps()) { return; }

        // We need to temporary clear the dirty flags and disable
        // dirty state change events to detect whether replaying ops
        // has any effect.

        // Save the old state, reset to false, disable event emit
        const oldState = this.dirtyDocument;
        this.dirtyDocument = false;
        this.emitDirtyDocumentEvent = false;

        // replay the ops
        this.pendingStateManager.replayPendingStates();

        // Save the new start and restore the old state, re-enable event emit
        const newState = this.dirtyDocument;
        this.dirtyDocument = oldState;
        this.emitDirtyDocumentEvent = true;

        // Officially transition from the old state to the new state.
        this.updateDocumentDirtyState(newState);
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        // There might be no change of state due to Container calling this API after loading runtime.
        const changeOfState = this._connected !== connected;
        this._connected = connected;

        if (changeOfState) {
           this.replayPendingStates();
        }

        this.dataStores.setConnectionState(connected, clientId);

        raiseConnectedEvent(this._logger, this, connected, clientId);

        if (connected) {
            assert(!!clientId);
            this.summaryManager.setConnected(clientId);
        } else {
            this.summaryManager.setDisconnected();
        }
    }

    public process(messageArg: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();

        // If it's not message for runtime, bail out right away.
        if (!isRuntimeMessage(messageArg)) {
            return;
        }

        // Do shallow copy of message, as methods below will modify it.
        // There might be multiple container instances receiving same message
        // We do not need to make deep copy, as each layer will just replace message.content itself,
        // but would not modify contents details
        let message = { ...messageArg };

        let error: any | undefined;

        // Surround the actual processing of the operation with messages to the schedule manager indicating
        // the beginning and end. This allows it to emit appropriate events and/or pause the processing of new
        // messages once a batch has been fully processed.
        this.scheduleManager.beginOperation(message);

        try {
            message = unpackRuntimeMessage(message);

            // Chunk processing must come first given that we will transform the message to the unchunked version
            // once all pieces are available
            message = this.processRemoteChunkedMessage(message);

            let localMessageMetadata: unknown;
            if (local) {
                // Call the PendingStateManager to process local messages.
                // Do not process local chunked ops until all pieces are available.
                if (message.type !== ContainerMessageType.ChunkedOp) {
                    localMessageMetadata = this.pendingStateManager.processPendingLocalMessage(message);
                }

                // If there are no more pending messages after processing a local message,
                // the document is no longer dirty.
                if (!this.pendingStateManager.hasPendingMessages()) {
                    this.updateDocumentDirtyState(false);
                }
            }

            switch (message.type) {
                case ContainerMessageType.Attach:
                    this.dataStores.processAttachMessage(message, local);
                    break;
                case ContainerMessageType.FluidDataStoreOp:
                    this.dataStores.processFluidDataStoreOp(message, local, localMessageMetadata);
                    break;
                case ContainerMessageType.BlobAttach:
                    assert(message?.metadata?.blobId);
                    this.blobManager.addBlobId(message.metadata.blobId);
                    break;
                default:
            }

            this.emit("op", message);
        } catch (e) {
            error = e;
            throw e;
        } finally {
            this.scheduleManager.endOperation(error, message);
        }
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as ISignalEnvelope;
        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: envelope.contents.content,
            type: envelope.contents.type,
        };

        if (envelope.address === undefined) {
            // No address indicates a container signal message.
            this.emit("signal", transformed, local);
            return;
        }

        this.dataStores.processSignal(envelope.address, transformed, local);
    }

    public async getRootDataStore(id: string, wait = true): Promise<IFluidRouter> {
        return this.dataStores.getDataStore(id, wait);
    }

    protected async getDataStore(id: string, wait = true): Promise<IFluidRouter> {
        return this.dataStores.getDataStore(id, wait);
    }

    public notifyDataStoreInstantiated(context: IFluidDataStoreContext) {
        const fluidDataStorePkgName = context.packagePath[context.packagePath.length - 1];
        const registryPath =
            `/${context.packagePath.slice(0, context.packagePath.length - 1).join("/")}`;
        this.emit("fluidDataStoreInstantiated", fluidDataStorePkgName, registryPath, !context.existing);
    }

    public setFlushMode(mode: FlushMode): void {
        if (mode === this._flushMode) {
            return;
        }

        // If switching to manual mode add a warning trace indicating the underlying loader does not support
        // this feature yet. Can remove in 0.9.
        if (!this.deltaSender && mode === FlushMode.Manual) {
            debug("DeltaManager does not yet support flush modes");
            return;
        }

        // Flush any pending batches if switching back to automatic
        if (mode === FlushMode.Automatic) {
            this.flush();
        }

        this._flushMode = mode;

        // Let the PendingStateManager know that FlushMode has been updated.
        this.pendingStateManager.onFlushModeUpdated(mode);
    }

    public flush(): void {
        if (!this.deltaSender) {
            debug("DeltaManager does not yet support flush modes");
            return;
        }

        // Let the PendingStateManager know that there was an attempt to flush messages.
        // Note that this should happen before the `this.needsFlush` check below because in the scenario where we are
        // not connected, `this.needsFlush` will be false but the PendingStateManager might have pending messages and
        // hence needs to track this.
        this.pendingStateManager.onFlush();

        // If flush has already been called then exit early
        if (!this.needsFlush) {
            return;
        }

        this.needsFlush = false;
        return this.deltaSender.flush();
    }

    public orderSequentially(callback: () => void): void {
        // If flush mode is already manual we are either
        // nested in another orderSequentially, or
        // the app is flushing manually, in which
        // case this invocation doesn't own
        // flushing.
        if (this.flushMode === FlushMode.Manual) {
            callback();
        } else {
            const savedFlushMode = this.flushMode;

            this.setFlushMode(FlushMode.Manual);

            try {
                callback();
            } finally {
                this.flush();
                this.setFlushMode(savedFlushMode);
            }
        }
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
        return this.dataStores.createDetachedDataStoreCore(pkg, true, rootDataStoreId);
    }

    public createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached {
        return this.dataStores.createDetachedDataStoreCore(pkg, false);
    }

    public async _createDataStoreWithProps(pkg: string | string[], props?: any, id = uuid()):
        Promise<IFluidDataStoreChannel> {
        return this.dataStores._createFluidDataStoreContext(
            Array.isArray(pkg) ? pkg : [pkg], id, false /* isRoot */, props).realize();
    }

    private async _createDataStore(
        pkg: string | string[],
        isRoot: boolean,
        id = uuid(),
    ): Promise<IFluidDataStoreChannel> {
        return this.dataStores._createFluidDataStoreContext(Array.isArray(pkg) ? pkg : [pkg], id, isRoot).realize();
    }

    private canSendOps() {
        return this.connected && !this.deltaManager.readonly;
    }

    public getQuorum(): IQuorum {
        return this.context.quorum;
    }

    public getAudience(): IAudience {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.audience!;
    }

    public raiseContainerWarning(warning: ContainerWarning) {
        this.context.raiseContainerWarning(warning);
    }

    /**
     * Notifies this object to register tasks to be performed.
     * @param tasks - List of tasks.
     * @param version - Version of the Fluid package.
     */
    public registerTasks(tasks: string[], version?: string) {
        this.verifyNotClosed();
        this.tasks = tasks;
        this.version = version;
        if (this.leader) {
            this.runTaskAnalyzer();
        }
    }

    /**
     * Returns true of document is dirty, i.e. there are some pending local changes that
     * either were not sent out to delta stream or were not yet acknowledged.
     */
    public isDocumentDirty(): boolean {
        return this.dirtyDocument;
    }

    /**
     * Will return true for any message that affect the dirty state of this document
     * This function can be used to filter out any runtime operations that should not be affecting whether or not
     * the IFluidDataStoreRuntime.isDocumentDirty call returns true/false
     * @param type - The type of ContainerRuntime message that is being checked
     * @param contents - The contents of the message that is being verified
     */
    public isMessageDirtyable(message: ISequencedDocumentMessage) {
        assert(
            isRuntimeMessage(message) === true,
            "Message passed for dirtyable check should be a container runtime message",
        );
        return this.isContainerMessageDirtyable(message.type as ContainerMessageType, message.contents);
    }

    private isContainerMessageDirtyable(type: ContainerMessageType, contents: any) {
        if (type === ContainerMessageType.Attach) {
            const attachMessage = contents as InboundAttachMessage;
            if (attachMessage.id === taskSchedulerId) {
                return false;
            }
        } else if (type === ContainerMessageType.FluidDataStoreOp) {
            const envelope = contents as IEnvelope;
            if (envelope.address === taskSchedulerId) {
                return false;
            }
        }
        return true;
    }

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        const envelope: ISignalEnvelope = { address: undefined, contents: { type, content } };
        return this.context.submitSignalFn(envelope);
    }

    public submitDataStoreSignal(address: string, type: string, content: any) {
        const envelope: ISignalEnvelope = { address, contents: { type, content } };
        return this.context.submitSignalFn(envelope);
    }

    /**
     * Returns a summary of the runtime at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree.
     * @param trackState - This tells whether we should track state from this summary.
     */
    private async summarize(fullTree: boolean = false, trackState: boolean = true): Promise<IChannelSummarizeResult> {
        const summarizeResult = await this.summarizerNode.summarize(fullTree, trackState);
        assert(summarizeResult.summary.type === SummaryType.Tree,
            "Container Runtime's summarize should always return a tree");
        return summarizeResult as IChannelSummarizeResult;
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const summarizeResult = await this.dataStores.summarize(fullTree, trackState);
        this.addContainerBlobsToSummary(summarizeResult);
        return {
            ...summarizeResult,
            id: "",
        };
    }

    public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
        if (attachState === AttachState.Attaching) {
            assert(this.attachState === AttachState.Attaching,
                "Container Context should already be in attaching state");
        } else {
            assert(this.attachState === AttachState.Attached, "Container Context should already be in attached state");
        }
        this.dataStores.setAttachState(attachState);
    }

    public createSummary(): ISummaryTree {
        const summaryTree = this.dataStores.createSummary();
        this.addContainerBlobsToSummary(summaryTree);
        return summaryTree.summary;
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.context.getAbsoluteUrl === undefined) {
            throw new Error("Driver does not implement getAbsoluteUrl");
        }
        if (this.attachState !== AttachState.Attached) {
            return undefined;
        }
        return this.context.getAbsoluteUrl(relativeUrl);
    }

    /** Implementation of ISummarizerInternalsProvider.generateSummary */
    public async generateSummary(
        fullTree: boolean = false,
        safe: boolean = false,
        summaryLogger: ITelemetryLogger,
    ): Promise<GenerateSummaryData | undefined> {
        const summaryRefSeqNum = this.deltaManager.lastSequenceNumber;
        const message =
            `Summary @${summaryRefSeqNum}:${this.deltaManager.minimumSequenceNumber}`;

        this.summarizerNode.startSummary(summaryRefSeqNum, summaryLogger);

        try {
            await this.deltaManager.inbound.pause();

            const attemptData: Omit<IUnsubmittedSummaryData, "reason"> = {
                referenceSequenceNumber: summaryRefSeqNum,
                submitted: false,
            };

            if (!this.connected) {
                // If summarizer loses connection it will never reconnect
                return { ...attemptData, reason: "disconnected" };
            }

            if (!this.runtimeOptions.disableGC) {
                const perfEvent = PerformanceEvent.start(summaryLogger, {
                    eventName: "GarbageCollection",
                });

                const gcStats: { totalGCNodes?: number; deletedGCNodes?: number } = {};
                try {
                    // Get the container's GC data and run GC on the reference graph in it.
                    const gcData = await this.dataStores.getGCData(this.runtimeOptions.runFullGC === true);
                    const { referencedNodeIds, deletedNodeIds } = runGarbageCollection(
                        gcData.gcNodes, [ "/" ],
                        this.logger,
                    );

                    // Update stats to be reported in the peformance event.
                    gcStats.deletedGCNodes = deletedNodeIds.length;
                    gcStats.totalGCNodes = referencedNodeIds.length + gcStats.deletedGCNodes;

                    // Update our summarizer node's used routes. Updating used routes in summarizer node before
                    // summarizing is required and asserted by the the summarizer node. We are the root and are
                    // always referenced, so the used routes is only self-route (empty string).
                    this.summarizerNode.updateUsedRoutes([""]);

                    // Remove this node's route ("/") and notify data stores of routes that are used in it.
                    const usedRoutes = referencedNodeIds.filter((id: string) => { return id !== "/"; });
                    this.dataStores.updateUsedRoutes(usedRoutes);
                } catch (error) {
                    perfEvent.cancel(gcStats, error);
                    throw error;
                }
                perfEvent.end(gcStats);
            }

            const trace = Trace.start();
            const summarizeResult = await this.summarize(fullTree || safe, true /* trackState */);

            const generateData: IGeneratedSummaryData = {
                summaryStats: summarizeResult.stats,
                generateDuration: trace.trace().duration,
            };

            if (!this.connected) {
                return { ...attemptData, ...generateData, reason: "disconnected" };
            }

            // Ensure that lastSequenceNumber has not changed after pausing
            const lastSequenceNumber = this.deltaManager.lastSequenceNumber;
            assert(
                lastSequenceNumber === summaryRefSeqNum,
                `lastSequenceNumber changed while paused. ${lastSequenceNumber} !== ${summaryRefSeqNum}`,
            );

            const handle = await this.storage.uploadSummaryWithContext(
                summarizeResult.summary,
                this.latestSummaryAck);

            // safe mode refreshes the latest summary ack
            if (safe) {
                const version = await this.getVersionFromStorage(this.id);
                await this.refreshLatestSummaryAck(
                    undefined,
                    version.id,
                    new ChildLogger(summaryLogger, undefined, { safeSummary: true }),
                    version,
                );
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const parent = this.latestSummaryAck.ackHandle!;
            const summaryMessage: ISummaryContent = {
                handle,
                head: parent,
                message,
                parents: parent ? [parent] : [],
            };
            const uploadData: IUploadedSummaryData = {
                handle,
                uploadDuration: trace.trace().duration,
            };

            if (!this.connected) {
                return { ...attemptData, ...generateData, ...uploadData, reason: "disconnected" };
            }

            // We need the summary op's reference sequence number to match our summary sequence number
            // Otherwise we'll get the wrong sequence number stamped on the summary's .protocol attributes
            assert(
                this.deltaManager.lastSequenceNumber === summaryRefSeqNum,
                `lastSequenceNumber changed before the summary op could be submitted. `
                + `${this.deltaManager.lastSequenceNumber} !== ${summaryRefSeqNum}`,
            );

            const clientSequenceNumber =
                this.submitSystemMessage(MessageType.Summarize, summaryMessage);

            this.summarizerNode.completeSummary(handle);

            return {
                ...attemptData,
                ...generateData,
                ...uploadData,
                submitted: true,
                clientSequenceNumber,
                submitOpDuration: trace.trace().duration,
            };
        } finally {
            // Cleanup wip summary in case of failure
            this.summarizerNode.clearSummary();
            // Restart the delta manager
            this.deltaManager.inbound.resume();
        }
    }

    private processRemoteChunkedMessage(message: ISequencedDocumentMessage) {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return message;
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            const newMessage = { ...message };
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serializedContent = this.chunkMap.get(clientId)!.join("");
            newMessage.contents = JSON.parse(serializedContent);
            newMessage.type = chunkedContent.originalType;
            this.clearPartialChunks(clientId);
            return newMessage;
        }
        return message;
    }

    private addChunk(clientId: string, chunkedContent: IChunkedOp) {
        let map = this.chunkMap.get(clientId);
        if (map === undefined) {
            map = [];
            this.chunkMap.set(clientId, map);
        }
        assert(chunkedContent.chunkId === map.length + 1); // 1-based indexing
        map.push(chunkedContent.contents);
    }

    private clearPartialChunks(clientId: string) {
        if (this.chunkMap.has(clientId)) {
            this.chunkMap.delete(clientId);
        }
    }

    private updateDocumentDirtyState(dirty: boolean) {
        if (this.dirtyDocument === dirty) {
            return;
        }

        this.dirtyDocument = dirty;
        if (this.emitDirtyDocumentEvent) {
            this.emit(dirty ? "dirtyDocument" : "savedDocument");
        }
    }

    public submitDataStoreOp(
        id: string,
        contents: any,
        localOpMetadata: unknown = undefined): void {
        const envelope: IEnvelope = {
            address: id,
            contents,
        };
        this.submit(ContainerMessageType.FluidDataStoreOp, envelope, localOpMetadata);
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return this.blobManager.createBlob(blob);
    }

    private submit(
        type: ContainerMessageType,
        content: any,
        localOpMetadata: unknown = undefined,
        opMetadata: Record<string, unknown> | undefined = undefined,
    ): void {
        this.verifyNotClosed();

        let clientSequenceNumber: number = -1;
        let opMetadataInternal = opMetadata;

        if (this.canSendOps()) {
            const serializedContent = JSON.stringify(content);
            const maxOpSize = this.context.deltaManager.maxMessageSize;

            // If in manual flush mode we will trigger a flush at the next turn break
            if (this.flushMode === FlushMode.Manual && !this.needsFlush) {
                opMetadataInternal = {
                    ...opMetadata,
                    batch: true,
                };
                this.needsFlush = true;

                // Use Promise.resolve().then() to queue a microtask to detect the end of the turn and force a flush.
                if (!this.flushTrigger) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    Promise.resolve().then(() => {
                        this.flushTrigger = false;
                        this.flush();
                    });
                }
            }

            // Note: Chunking will increase content beyond maxOpSize because we JSON'ing JSON payload -
            // there will be a lot of escape characters that can make it up to 2x bigger!
            // This is Ok, because DeltaManager.shouldSplit() will have 2 * maxMessageSize limit
            if (!serializedContent || serializedContent.length <= maxOpSize) {
                clientSequenceNumber = this.submitRuntimeMessage(
                    type,
                    content,
                    /* batch: */ this._flushMode === FlushMode.Manual,
                    opMetadataInternal);
            } else {
                clientSequenceNumber = this.submitChunkedMessage(type, serializedContent, maxOpSize);
            }
        }

        // Let the PendingStateManager know that a message was submitted.
        this.pendingStateManager.onSubmitMessage(
            type,
            clientSequenceNumber,
            content,
            localOpMetadata,
            opMetadataInternal,
        );
        if (this.isContainerMessageDirtyable(type, content)) {
            this.updateDocumentDirtyState(true);
        }
    }

    private submitChunkedMessage(type: ContainerMessageType, content: string, maxOpSize: number): number {
        const contentLength = content.length;
        const chunkN = Math.floor((contentLength - 1) / maxOpSize) + 1;
        let offset = 0;
        let clientSequenceNumber: number = 0;
        for (let i = 1; i <= chunkN; i = i + 1) {
            const chunkedOp: IChunkedOp = {
                chunkId: i,
                contents: content.substr(offset, maxOpSize),
                originalType: type,
                totalChunks: chunkN,
            };
            offset += maxOpSize;
            clientSequenceNumber = this.submitRuntimeMessage(
                ContainerMessageType.ChunkedOp,
                chunkedOp,
                false);
        }
        return clientSequenceNumber;
    }

    private submitSystemMessage(
        type: MessageType,
        contents: any) {
        this.verifyNotClosed();
        assert(this.connected);

        // System message should not be sent in the middle of the batch.
        // That said, we can preserve existing behavior by not flushing existing buffer.
        // That might be not what caller hopes to get, but we can look deeper if telemetry tells us it's a problem.
        const middleOfBatch = this.flushMode === FlushMode.Manual && this.needsFlush;
        if (middleOfBatch) {
            this._logger.sendErrorEvent({ eventName: "submitSystemMessageError", type });
        }

        return this.context.submitFn(
            type,
            contents,
            middleOfBatch);
    }

    private submitRuntimeMessage(
        type: ContainerMessageType,
        contents: any,
        batch: boolean,
        appData?: any) {
        const payload: ContainerRuntimeMessage = { type, contents };
        return this.context.submitFn(
            MessageType.Operation,
            payload,
            batch,
            appData);
    }

    /**
     * Throw an error if the runtime is closed.  Methods that are expected to potentially
     * be called after dispose due to asynchrony should not call this.
     */
    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }

    /**
     * Finds the right store and asks it to resubmit the message. This typically happens when we
     * reconnect and there are pending messages.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    private reSubmit(
        type: ContainerMessageType,
        content: any,
        localOpMetadata: unknown,
        opMetadata: Record<string, unknown> | undefined,
    ) {
        switch (type) {
            case ContainerMessageType.FluidDataStoreOp:
                // For Operations, call resubmitDataStoreOp which will find the right store
                // and trigger resubmission on it.
                this.dataStores.resubmitDataStoreOp(content, localOpMetadata);
                break;
            case ContainerMessageType.Attach:
                this.submit(type, content, localOpMetadata);
                break;
            case ContainerMessageType.ChunkedOp:
                throw new Error(`chunkedOp not expected here`);
            case ContainerMessageType.BlobAttach:
                this.submit(type, content, localOpMetadata, opMetadata);
                break;
            default:
                unreachableCase(type, `Unknown ContainerMessageType: ${type}`);
        }
    }

    private subscribeToLeadership() {
        if (this.context.clientDetails.capabilities.interactive) {
            this.getScheduler().then((scheduler) => {
                const LeaderTaskId = "leader";

                // Each client expresses interest to be a leader.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                scheduler.pick(LeaderTaskId, async () => {
                    assert(!this._leader);
                    this.updateLeader(true);
                });

                scheduler.on("lost", (key) => {
                    if (key === LeaderTaskId) {
                        assert(this._leader);
                        this._leader = false;
                        this.updateLeader(false);
                    }
                });
            }).catch((err) => {
                this.closeFn(CreateContainerError(err));
            });

            this.context.quorum.on("removeMember", () => {
                if (this.leader) {
                    this.runTaskAnalyzer();
                }
            });
        }
    }

    public async getTaskManager(): Promise<ITaskManager> {
        return requestFluidObject<ITaskManager>(
            await this.getDataStore(taskSchedulerId, true),
            "");
    }

    public async getScheduler(): Promise<IAgentScheduler> {
        const taskManager = await this.getTaskManager();
        return taskManager.IAgentScheduler;
    }

    private updateLeader(leadership: boolean) {
        this._leader = leadership;
        if (this.leader) {
            assert(this.clientId === undefined || this.connected && this.deltaManager && this.deltaManager.active);
            this.emit("leader");
        } else {
            this.emit("notleader");
        }

        this.dataStores.updateLeader();

        if (this.leader) {
            this.runTaskAnalyzer();
        }
    }

    /**
     * On a client joining/departure, decide whether this client is the new leader.
     * If so, calculate if there are any unhandled tasks for browsers and remote agents.
     * Emit local help message for this browser and submits a remote help message for agents.
     */
    private runTaskAnalyzer() {
        // Analyze the current state and ask for local and remote help separately.
        // If called for detached container, the clientId would not be assigned and it is disconnected. In this
        // case, all tasks are run by the detached container. Called only if a leader. If we have a clientId,
        // then we should be connected as leadership is lost on losing connection.
        const helpTasks = this.clientId === undefined ?
            { browser: this.tasks, robot: [] } :
            analyzeTasks(this.clientId, this.getQuorum().getMembers(), this.tasks);

        if (helpTasks && (helpTasks.browser.length > 0 || helpTasks.robot.length > 0)) {
            if (helpTasks.browser.length > 0) {
                const localHelpMessage: IHelpMessage = {
                    tasks: helpTasks.browser,
                    version: this.version,   // Back-compat
                };
                debug(`Requesting local help for ${helpTasks.browser}`);
                this.emit("localHelp", localHelpMessage);
            }
            if (helpTasks.robot.length > 0) {
                const remoteHelpMessage: IHelpMessage = {
                    tasks: helpTasks.robot,
                    version: this.version,   // Back-compat
                };
                debug(`Requesting remote help for ${helpTasks.robot}`);
                this.submitSystemMessage(MessageType.RemoteHelp, remoteHelpMessage);
            }
        }
    }

    /** Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck */
    public async refreshLatestSummaryAck(
        proposalHandle: string | undefined,
        ackHandle: string,
        summaryLogger: ITelemetryLogger,
        version?: IVersion,
    ) {
        this.latestSummaryAck = { proposalHandle, ackHandle };

        const getSnapshot = async () => {
            const perfEvent = PerformanceEvent.start(summaryLogger, {
                eventName: "RefreshLatestSummaryGetSnapshot",
                hasVersion: !!version, // expected in this case
            });
            const stats: { getVersionDuration?: number; getSnapshotDuration?: number } = {};
            let snapshot: ISnapshotTree | undefined;
            try {
                const trace = Trace.start();

                const versionToUse = version ?? await this.getVersionFromStorage(ackHandle);
                stats.getVersionDuration = trace.trace().duration;

                snapshot = await this.getSnapshotFromStorage(versionToUse);
                stats.getSnapshotDuration = trace.trace().duration;
            } catch (error) {
                perfEvent.cancel(stats, error);
                throw error;
            }

            perfEvent.end(stats);
            return snapshot;
        };

        await this.summarizerNode.refreshLatestSummary(
                proposalHandle,
                getSnapshot,
                async <T>(id: string) => readAndParse<T>(this.storage, id),
                summaryLogger,
            );
        }

    private async getVersionFromStorage(versionId: string): Promise<IVersion> {
        const versions = await this.storage.getVersions(versionId, 1);
        assert(!!versions && !!versions[0], "Failed to get version from storage");
        return versions[0];
    }

    private async getSnapshotFromStorage(version: IVersion): Promise<ISnapshotTree> {
        const snapshot = await this.storage.getSnapshotTree(version);
        assert(!!snapshot, "Failed to get snapshot from storage");
        return snapshot;
    }
}
