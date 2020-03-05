/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { AgentSchedulerFactory } from "@microsoft/fluid-agent-scheduler";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentHandleContext,
    IComponentSerializer,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IComponentTokenProvider,
    IContainerContext,
    IDeltaManager,
    IDeltaSender,
    ILoader,
    IRuntime,
    IRuntimeState,
    IExperimentalRuntime,
} from "@microsoft/fluid-container-definitions";
import {
    Deferred,
    Trace,
    LazyPromise,
    ChildLogger,
} from "@microsoft/fluid-common-utils";
import { IDocumentStorageService, ISummaryContext } from "@microsoft/fluid-driver-definitions";
import { readAndParse, createIError } from "@microsoft/fluid-driver-utils";
import {
    BlobTreeEntry,
    buildSnapshotTree,
    isSystemType,
    raiseConnectedEvent,
    TreeTreeEntry,
} from "@microsoft/fluid-protocol-base";
import {
    ConnectionState,
    IChunkedOp,
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
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import {
    FlushMode,
    IAttachMessage,
    IComponentRegistry,
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
    IInboundSignalMessage,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ComponentSerializer, SummaryTracker } from "@microsoft/fluid-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { ComponentContext, LocalComponentContext, RemotedComponentContext } from "./componentContext";
import { ComponentHandleContext } from "./componentHandleContext";
import { ComponentRegistry } from "./componentRegistry";
import { debug } from "./debug";
import { BlobCacheStorageService } from "./blobCacheStorageService";
import {
    componentRuntimeRequestHandler,
    createLoadableComponentRuntimeRequestHandler,
    RuntimeRequestHandler,
} from "./requestHandlers";
import { RequestParser } from "./requestParser";
import { RuntimeRequestHandlerBuilder } from "./runtimeRequestHandlerBuilder";
import { Summarizer } from "./summarizer";
import { SummaryManager } from "./summaryManager";
import { ISummaryStats, SummaryTreeConverter } from "./summaryTreeConverter";
import { analyzeTasks } from "./taskAnalyzer";
import { DeltaScheduler } from "./deltaScheduler";
import { ReportConnectionTelemetry } from "./connectionTelemetry";
import { SummaryCollection } from "./summaryCollection";

interface ISummaryTreeWithStats {
    summaryStats: ISummaryStats;
    summaryTree: ISummaryTree;
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

    // Wait 10 minutes for summary ack
    maxAckWaitTime: 600000,
};

/**
 * Options for container runtime.
 */
export interface IContainerRuntimeOptions {
    // Experimental flag that will generate summaries if connected to a service that supports them.
    // This defaults to true and must be explicitly set to false to disable.
    generateSummaries: boolean;

    // Experimental flag that will execute tasks in web worker if connected to a service that supports them.
    enableWorker?: boolean;
}

interface IRuntimeMessageMetadata {
    batch?: boolean;
}

export class ScheduleManager {
    private readonly deltaScheduler: DeltaScheduler;
    private pauseSequenceNumber: number | undefined;
    private pauseClientId: string | undefined;

    private paused = false;
    private localPaused = false;
    private batchClientId: string;

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

            // If only length one then clear
            if (messages.length === 1) {
                delete messages[0].metadata;
                return;
            }

            // Set the batch flag to false on the last message to indicate the end of the send batch
            const lastMessage = messages[messages.length - 1];
            lastMessage.metadata = { ...lastMessage.metadata, ...{ batch: false } };
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
        this.updatePauseState(this.deltaManager.referenceSequenceNumber);
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

            // This could be the beginning of a new batch or an invidual message.
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

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public pause(): Promise<void> {
        this.paused = true;
        return this.deltaManager.inbound.systemPause();
    }

    public resume() {
        this.paused = false;
        if (!this.localPaused) {
            this.deltaManager.inbound.systemResume();
        }
    }

    private setPaused(localPaused: boolean) {
        // Return early if no change in value
        if (this.localPaused === localPaused) {
            return;
        }

        this.localPaused = localPaused;
        if (localPaused || this.paused) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.deltaManager.inbound.systemPause();
        } else {
            this.deltaManager.inbound.systemResume();
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

function isRuntimeMessage(message: ISequencedDocumentMessage): boolean {
    switch (message.type) {
        case MessageType.ChunkedOp:
        case MessageType.Attach:
        case MessageType.Operation:
            return true;
        default:
            return false;
    }
}

export const schedulerId = "_scheduler";
const schedulerRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length > 0 && request.pathParts[0] === schedulerId) {
            return componentRuntimeRequestHandler(request, runtime);
        }
        return undefined;
    };

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 * It will define the component level mappings.
 */
export class ContainerRuntime extends EventEmitter implements IHostRuntime, IRuntime, IExperimentalRuntime {

    public readonly isExperimentalRuntime = true;
    /**
     * Load the components from a snapshot and returns the runtime.
     * @param context - Context of the container.
     * @param registry - Mapping to the components.
     * @param requestHandlers - Request handlers for the container runtime
     * @param runtimeOptions - Additional options to be passed to the runtime
     */
    public static async load(
        context: IContainerContext,
        registryEntries: NamedComponentRegistryEntries,
        requestHandlers: RuntimeRequestHandler[] = [],
        runtimeOptions?: IContainerRuntimeOptions,
        containerScope: IComponent = context.scope,
    ): Promise<ContainerRuntime> {
        const componentRegistry = new ContainerRuntimeComponentRegistry(registryEntries);

        const chunkId = context.baseSnapshot?.blobs[".chunks"];
        const chunks = chunkId
            ? await readAndParse<[string, string[]][]>(context.storage, chunkId)
            : [];

        const runtime = new ContainerRuntime(context, componentRegistry, chunks, runtimeOptions, containerScope);
        runtime.requestHandler = new RuntimeRequestHandlerBuilder();
        runtime.requestHandler.pushHandler(
            createLoadableComponentRuntimeRequestHandler(runtime.summarizer),
            schedulerRuntimeRequestHandler,
            ...requestHandlers);

        // Create all internal components in first load.
        if (!context.existing) {
            await runtime.createComponent(schedulerId, schedulerId)
                .then((componentRuntime) => componentRuntime.attach());
        }

        runtime.subscribeToLeadership();

        return runtime;
    }

    public get connectionState(): ConnectionState {
        return this.context.connectionState;
    }

    public get id(): string {
        return this.context.id;
    }

    public get parentBranch(): string {
        return this.context.parentBranch;
    }

    public get existing(): boolean {
        return this.context.existing;
    }

    public get options(): any {
        return this.context.options;
    }

    public get clientId(): string {
        return this.context.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.context.clientDetails;
    }

    public get blobManager(): IBlobManager {
        return this.context.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.context.deltaManager;
    }

    public get storage(): IDocumentStorageService {
        return this.context.storage;
    }

    public get branch(): string {
        return this.context.branch;
    }

    public get submitFn(): (type: MessageType, contents: any) => number {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        return this.submit;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this.context.submitSignalFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.context.snapshotFn;
    }

    public get closeFn(): (reason?: string) => void {
        return this.context.closeFn;
    }

    public get loader(): ILoader {
        return this.context.loader;
    }

    public get flushMode(): FlushMode {
        return this._flushMode;
    }

    public get scope(): IComponent {
        return this.containerScope;
    }

    public get IComponentRegistry(): IComponentRegistry {
        return this.registry;
    }

    public nextSummarizerP?: Promise<Summarizer>;
    public nextSummarizerD?: Deferred<Summarizer>;

    public readonly IComponentSerializer: IComponentSerializer = new ComponentSerializer();

    public readonly IComponentHandleContext: IComponentHandleContext;

    public readonly logger: ITelemetryLogger;
    public readonly previousState: IPreviousState;
    private readonly summaryManager: SummaryManager;
    private readonly summaryTreeConverter: SummaryTreeConverter;
    private latestSummaryAck: ISummaryContext;
    private readonly summaryTracker: SummaryTracker;

    private tasks: string[] = [];

    // Back-compat: version decides between loading document and chaincode.
    private version: string;

    private _flushMode = FlushMode.Automatic;
    private needsFlush = false;
    private flushTrigger = false;

    // Always matched IAgentScheduler.leader property
    private _leader = false;

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get leader(): boolean {
        return this._leader;
    }

    public get summarizerClientId(): string {
        return this.summaryManager.summarizer;
    }

    private get summaryConfiguration() {
        return this.context.serviceConfiguration
            ? { ...DefaultSummaryConfiguration, ...this.context.serviceConfiguration.summary }
            : DefaultSummaryConfiguration;
    }

    // Components tracked by the Domain
    private closed = false;
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private dirtyDocument = false;
    private readonly summarizer: Summarizer;
    private readonly deltaSender: IDeltaSender | undefined;
    private readonly scheduleManager: ScheduleManager;
    private requestHandler: RuntimeRequestHandlerBuilder;

    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    // Attached and loaded context proxies
    private readonly contexts = new Map<string, ComponentContext>();
    // List of pending contexts (for the case where a client knows a component will exist and is waiting
    // on its creation). This is a superset of contexts.
    private readonly contextsDeferred = new Map<string, Deferred<ComponentContext>>();

    private loadedFromSummary: boolean;

    private constructor(
        private readonly context: IContainerContext,
        private readonly registry: IComponentRegistry,
        readonly chunks: [string, string[]][],
        private readonly runtimeOptions: IContainerRuntimeOptions = { generateSummaries: true, enableWorker: false },
        private readonly containerScope: IComponent,
    ) {
        super();

        this.chunkMap = new Map<string, string[]>(chunks);

        this.IComponentHandleContext = new ComponentHandleContext("", this);

        // useContext - back-compat: 0.14 uploadSummary
        const useContext = this.storage.uploadSummaryWithContext !== undefined;
        this.latestSummaryAck = { proposalHandle: undefined, ackHandle: undefined };
        this.summaryTracker = new SummaryTracker(
            useContext,
            "", // fullPath - the root is unnamed
            this.deltaManager.initialSequenceNumber, // referenceSequenceNumber - last acked summary ref seq number
            this.deltaManager.initialSequenceNumber, // latestSequenceNumber - latest sequence number seen
            async () => undefined, // getSnapshotTree - this will be replaced on summary ack
        );
        this.summaryTreeConverter = new SummaryTreeConverter(useContext);

        // Extract components stored inside the snapshot
        this.loadedFromSummary = context.baseSnapshot?.trees[".protocol"] ? true : false;
        const components = new Map<string, ISnapshotTree | string>();
        if (this.loadedFromSummary) {
            Object.keys(context.baseSnapshot.trees).forEach((value) => {
                if (value !== ".protocol") {
                    const tree = context.baseSnapshot.trees[value];
                    components.set(value, tree);
                }
            });
        } else if (context.baseSnapshot) {
            Object.keys(context.baseSnapshot.commits).forEach((key) => {
                const moduleId = context.baseSnapshot.commits[key];
                components.set(key, moduleId);
            });
        }

        // Create a context for each of them
        for (const [key, value] of components) {
            const componentContext = new RemotedComponentContext(
                key,
                value,
                this,
                this.storage,
                this.containerScope,
                this.summaryTracker.createOrGetChild(key, this.summaryTracker.referenceSequenceNumber));
            const deferred = new Deferred<ComponentContext>();
            deferred.resolve(componentContext);

            this.contexts.set(key, componentContext);
            this.contextsDeferred.set(key, deferred);
        }

        this.logger = context.logger;

        this.scheduleManager = new ScheduleManager(
            context.deltaManager,
            this,
            ChildLogger.create(this.logger, "ScheduleManager"),
        );

        this.deltaSender = this.deltaManager;

        this.deltaManager.on("allSentOpsAckd", () => {
            this.updateDocumentDirtyState(false);
        });

        this.deltaManager.on("submitOp", (message: IDocumentMessage) => {
            if (!isSystemType(message.type) && message.type !== MessageType.NoOp) {
                this.logger.debugAssert(this.connected, { eventName: "submitOp in disconnected state" });
                this.updateDocumentDirtyState(true);
            }
        });

        this.context.quorum.on("removeMember", (clientId: string) => {
            this.clearPartialChunks(clientId);
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
            this,
            () => this.summaryConfiguration,
            async (safe: boolean) => this.generateSummary(!this.loadedFromSummary, safe),
            async (summContext, refSeq) => this.refreshLatestSummaryAck(summContext, refSeq),
            this.previousState.summaryCollection);

        // Create the SummaryManager and mark the initial state
        this.summaryManager = new SummaryManager(
            context,
            this.runtimeOptions.generateSummaries !== false || this.loadedFromSummary,
            this.runtimeOptions.enableWorker,
            this.logger,
            (summarizer) => { this.nextSummarizerP = summarizer; },
            this.previousState.nextSummarizerP,
            !!this.previousState.reload);

        if (this.context.connectionState === ConnectionState.Connected) {
            this.summaryManager.setConnected(this.context.clientId);
        }

        ReportConnectionTelemetry(this.context.clientId, this.deltaManager, this.logger);
    }

    public get IComponentTokenProvider() {

        if (this.options && this.options.intelligence) {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            return {
                intelligence: this.options.intelligence,
            } as IComponentTokenProvider;
        }
        return undefined;
    }

    public get IComponentConfiguration() {
        return this.context.configuration;
    }

    /**
     * Notifies this object about the request made to the container.
     * @param request - Request made to the handler.
     */
    public async request(request: IRequest): Promise<IResponse> {
        // Otherwise defer to the app to handle the request
        return this.requestHandler.handleRequest(request, this);
    }

    /**
     * Notifies this object to take the snapshot of the container.
     * @param tagMessage - Message to supply to storage service for writing the snapshot.
     */
    public async snapshot(tagMessage: string, fullTree: boolean = false): Promise<ITree> {
        // Iterate over each component and ask it to snapshot
        const componentSnapshotsP = Array.from(this.contexts).map(async ([componentId, value]) => {
            const snapshot = await value.snapshot(fullTree);

            // If ID exists then previous commit is still valid
            return {
                componentId,
                snapshot,
            };
        });

        const root: ITree = { entries: [], id: null };

        // Add in module references to the component snapshots
        const componentSnapshots = await Promise.all(componentSnapshotsP);

        // Sort for better diffing of snapshots (in replay tool, used to find bugs in snapshotting logic)
        if (fullTree) {
            componentSnapshots.sort((a, b) => a.componentId.localeCompare(b.componentId));
        }

        for (const componentSnapshot of componentSnapshots) {
            root.entries.push(new TreeTreeEntry(componentSnapshot.componentId, componentSnapshot.snapshot));
        }

        if (this.chunkMap.size > 0) {
            root.entries.push(new BlobTreeEntry(".chunks", JSON.stringify([...this.chunkMap])));
        }

        return root;
    }

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.context.requestSnapshot(tagMessage);
    }

    public async stop(): Promise<IRuntimeState> {
        this.verifyNotClosed();
        const snapshot = await this.snapshot("", false);
        this.summaryManager.dispose();
        this.summarizer.dispose();
        this.closed = true;
        const state: IPreviousState = {
            reload: true,
            summaryCollection: this.summarizer.summaryCollection,
            nextSummarizerP: this.nextSummarizerP,
            nextSummarizerD: this.nextSummarizerD,
        };
        return { snapshot, state };
    }

    public changeConnectionState(value: ConnectionState, clientId: string, version: string) {
        this.verifyNotClosed();

        assert(this.connectionState === value);

        if (value === ConnectionState.Connected) {
            // Resend all pending attach messages prior to notifying clients
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [component, componentContext] of this.contexts) {
            try {
                componentContext.changeConnectionState(value, clientId);
            } catch (error) {
                this.logger.sendErrorEvent({
                    eventName: "ChangeConnectionStateError",
                    clientId,
                    component,
                }, error);
            }
        }

        try {
            raiseConnectedEvent(this, value, clientId);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "RaiseConnectedEventError", clientId }, error);
        }

        if (value === ConnectionState.Connected) {
            this.summaryManager.setConnected(clientId);
        } else {
            assert(!this._leader);
            this.summaryManager.setDisconnected();
        }
    }

    public process(message: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();

        let error: any | undefined;

        // Surround the actual processing of the operation with messages to the schedule manager indicating
        // the beginning and end. This allows it to emit appropriate events and/or pause the processing of new
        // messages once a batch has been fully processed.
        this.scheduleManager.beginOperation(message);
        try {
            this.processCore(message, local);
        } catch (e) {
            error = e;
            throw e;
        } finally {
            this.scheduleManager.endOperation(error, message);
        }
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as IEnvelope;
        const innerContent = envelope.contents as { content: any; type: string };
        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: innerContent.content,
            type: innerContent.type,
        };

        if (envelope.address === undefined) {
            // No address indicates a container signal message.
            this.emit("signal", transformed, local);
            return;
        }

        const context = this.contexts.get(envelope.address);
        if (!context) {
            // Attach message may not have been processed yet
            assert(!local);
            this.logger.sendTelemetryEvent({ eventName: "SignalComponentNotFound", componentId: envelope.address });
            return;
        }

        context.processSignal(transformed, local);
    }

    public async getComponentRuntime(id: string, wait = true): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        if (!this.contextsDeferred.has(id)) {
            // Add in a deferred that will resolve once the process ID arrives
            this.contextsDeferred.set(id, new Deferred<ComponentContext>());
        }
        const deferredContext = this.contextsDeferred.get(id);

        if (!wait && !deferredContext.isCompleted) {
            return Promise.reject(`Process ${id} does not exist`);
        }

        const componentContext = await deferredContext.promise;
        return componentContext.realize();
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
    }

    public flush(): void {
        if (!this.deltaSender) {
            debug("DeltaManager does not yet support flush modes");
            return;
        }

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

    public async createComponent(idOrPkg: string, maybePkg?: string | string[]) {
        const id = maybePkg === undefined ? uuid() : idOrPkg;
        const pkg = maybePkg === undefined ? idOrPkg : maybePkg;
        return this._createComponentWithProps(pkg, undefined, id);
    }

    public async _createComponentWithProps(pkg: string | string[], props: any, id: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const context = new LocalComponentContext(
            id,
            Array.isArray(pkg) ? pkg : [pkg],
            this,
            this.storage,
            this.containerScope,
            this.summaryTracker.createOrGetChild(id, this.deltaManager.referenceSequenceNumber),
            (cr: IComponentRuntime) => this.attachComponent(cr),
            props);

        const deferred = new Deferred<ComponentContext>();
        this.contextsDeferred.set(id, deferred);
        this.contexts.set(id, context);

        return context.realize();
    }

    public getQuorum(): IQuorum {
        return this.context.quorum;
    }

    public getAudience(): IAudience {
        return this.context.audience;
    }

    public error(error: any) {
        this.context.error(createIError(error));
    }

    /**
     * Notifies this object to register tasks to be performed.
     * @param tasks - List of tasks.
     * @param version - Version of the fluid package.
     */
    public registerTasks(tasks: string[], version?: string) {
        this.verifyNotClosed();
        this.tasks = tasks;
        this.version = version;
        if (this.leader) {
            this.runTaskAnalyzer();
        }
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Called by IComponentRuntime (on behalf of distributed data structure) in disconnected state to notify about
     * local changes. All pending changes are automatically flushed by shared objects on connection.
     */
    public notifyPendingMessages(): void {
        assert(!this.connected);
        this.updateDocumentDirtyState(true);
    }

    /**
     * Returns true of document is dirty, i.e. there are some pending local changes that
     * either were not sent out to delta stream or were not yet acknowledged.
     */
    public isDocumentDirty(): boolean {
        return this.dirtyDocument;
    }

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        const envelope: IEnvelope = { address: undefined, contents: {type, content} };
        return this.context.submitSignalFn(envelope);
    }

    public experimentalAttachServices(storageService: IDocumentStorageService): void {
        throw new Error("Method not implemented");
    }

    /**
     * Returns a summary of the runtime at the current sequence number.
     */
    private async summarize(fullTree: boolean = false): Promise<ISummaryTreeWithStats> {
        const summaryTree: ISummaryTree = {
            tree: {},
            type: SummaryType.Tree,
        };
        let summaryStats = SummaryTreeConverter.mergeStats();

        // Iterate over each component and ask it to snapshot
        await Promise.all(Array.from(this.contexts).map(async ([key, value]) => {
            const snapshot = await value.snapshot(fullTree);
            const treeWithStats = this.summaryTreeConverter.convertToSummaryTree(
                snapshot,
                `/${encodeURIComponent(key)}`,
                fullTree,
            );
            summaryTree.tree[key] = treeWithStats.summaryTree;
            summaryStats = SummaryTreeConverter.mergeStats(summaryStats, treeWithStats.summaryStats);
        }));

        if (this.chunkMap.size > 0) {
            summaryTree.tree[".chunks"] = {
                content: JSON.stringify([...this.chunkMap]),
                type: SummaryType.Blob,
            };
        }

        summaryStats.treeNodeCount++; // Add this root tree node
        return { summaryStats, summaryTree };
    }

    private processCore(messageArg: ISequencedDocumentMessage, local: boolean) {
        let remotedComponentContext: RemotedComponentContext;

        // Chunk processing must come first given that we will transform the message to the unchunked version
        // once all pieces are available
        let message = messageArg;
        if (messageArg.type === MessageType.ChunkedOp) {
            message = this.processRemoteChunkedMessage(messageArg);
        }

        // Old prepare part
        switch (message.type) {
            case MessageType.Attach:
                // The local object has already been attached
                if (local) {
                    break;
                }

                const attachMessage = message.contents as IAttachMessage;
                const flatBlobs = new Map<string, string>();
                let snapshotTree: ISnapshotTree = null;
                if (attachMessage.snapshot) {
                    snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
                }

                // Include the type of attach message which is the pkg of the component to be
                // used by RemotedComponentContext in case it is not in the snapshot.
                remotedComponentContext = new RemotedComponentContext(
                    attachMessage.id,
                    snapshotTree,
                    this,
                    new BlobCacheStorageService(this.storage, flatBlobs),
                    this.containerScope,
                    this.summaryTracker.createOrGetChild(attachMessage.id, message.sequenceNumber),
                    [attachMessage.type]);

                break;

            default:
        }

        // Process part
        switch (message.type) {
            case MessageType.Operation:
                this.processOperation(message, local);
                break;

            default:
        }

        this.emit("op", message);

        // Post-process part
        switch (message.type) {
            case MessageType.Attach:
                const attachMessage = message.contents as IAttachMessage;

                // If a non-local operation then go and create the object - otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(attachMessage.id));
                    this.pendingAttach.delete(attachMessage.id);
                } else {
                    // Resolve pending gets and store off any new ones
                    if (this.contextsDeferred.has(attachMessage.id)) {
                        this.contextsDeferred.get(attachMessage.id).resolve(remotedComponentContext);
                    } else {
                        const deferred = new Deferred<ComponentContext>();
                        deferred.resolve(remotedComponentContext);
                        this.contextsDeferred.set(attachMessage.id, deferred);
                    }
                    this.contexts.set(attachMessage.id, remotedComponentContext);

                    // Equivalent of nextTick() - Prefetch once all current ops have completed
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises, @typescript-eslint/promise-function-async
                    Promise.resolve().then(() => remotedComponentContext.realize());
                }
                break;
            default: // Do nothing
        }
    }

    private attachComponent(componentRuntime: IComponentRuntime): void {
        this.verifyNotClosed();

        const context = this.contexts.get(componentRuntime.id);
        const message = context.generateAttachMessage();

        this.pendingAttach.set(componentRuntime.id, message);
        if (this.connected) {
            this.submit(MessageType.Attach, message);
        }

        // Resolve the deferred so other local components can access it.
        const deferred = this.contextsDeferred.get(componentRuntime.id);
        deferred.resolve(context);
    }

    private async generateSummary(fullTree: boolean = false, safe: boolean = false): Promise<GenerateSummaryData> {
        const message =
            `Summary @${this.deltaManager.referenceSequenceNumber}:${this.deltaManager.minimumSequenceNumber}`;

        // TODO: Issue-2171 Support for Branch Snapshots
        if (this.parentBranch) {
            this.logger.sendTelemetryEvent({
                eventName: "SkipGenerateSummaryParentBranch",
                parentBranch: this.parentBranch,
            });
            return;
        }

        try {
            await this.scheduleManager.pause();

            const attemptData: IUnsubmittedSummaryData = {
                referenceSequenceNumber: this.deltaManager.referenceSequenceNumber,
                submitted: false,
            };

            if (!this.connected) {
                // If summarizer loses connection it will never reconnect
                return attemptData;
            }

            const trace = Trace.start();
            const treeWithStats = await this.summarize(fullTree || safe);

            const generateData: IGeneratedSummaryData = {
                summaryStats: treeWithStats.summaryStats,
                generateDuration: trace.trace().duration,
            };

            if (!this.connected) {
                return { ...attemptData, ...generateData };
            }

            let handle: string;
            if (this.summaryTracker.useContext === true) {
                handle = await this.context.storage.uploadSummaryWithContext(
                    treeWithStats.summaryTree,
                    this.latestSummaryAck);
            } else {
                // back-compat: 0.14 uploadSummary
                const summaryHandle = await this.context.storage.uploadSummary(
                    treeWithStats.summaryTree);
                handle = summaryHandle.handle;
            }

            // safe mode refreshes the latest summary ack
            if (safe) {
                const versions = await this.storage.getVersions(this.id, 1);
                const parents = versions.map((version) => version.id);
                await this.refreshLatestSummaryAck(
                    { proposalHandle: undefined, ackHandle: parents[0] },
                    this.deltaManager.referenceSequenceNumber);
            }

            const parent = this.latestSummaryAck.ackHandle;
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
                return { ...attemptData, ...generateData, ...uploadData };
            }

            const clientSequenceNumber = this.submit(MessageType.Summarize, summaryMessage);

            return {
                ...attemptData,
                ...generateData,
                ...uploadData,
                submitted: true,
                clientSequenceNumber,
                submitOpDuration: trace.trace().duration,
            };
        } finally {
            // Restart the delta manager
            this.scheduleManager.resume();
        }
    }

    private processRemoteChunkedMessage(message: ISequencedDocumentMessage) {
        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            const newMessage = { ...message };
            const serializedContent = this.chunkMap.get(clientId).join("");
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
        this.emit(dirty ? "dirtyDocument" : "savedDocument");
    }

    private submit(type: MessageType, content: any): number {
        this.verifyNotClosed();

        // Can't submit messages in disconnected state!
        // It's usually a bug that needs to be addressed in the code
        // (as callers should have logic to retain messages in disconnected state and resubmit on connection)
        // It's possible to remove this check -  we would need to skip deltaManager.maxMessageSize call below.
        if (!this.connected) {
            this.logger.sendErrorEvent({ eventName: "submitInDisconnectedState", type });
        }

        const serializedContent = JSON.stringify(content);
        const maxOpSize = this.context.deltaManager.maxMessageSize;

        let clientSequenceNumber: number;

        // If in manual flush mode we will trigger a flush at the next turn break
        let batchBegin = false;
        if (this.flushMode === FlushMode.Manual && !this.needsFlush) {
            batchBegin = true;
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
        if (serializedContent.length <= maxOpSize) {
            clientSequenceNumber = this.context.submitFn(
                type,
                content,
                this._flushMode === FlushMode.Manual,
                batchBegin ? { batch: true } : undefined);
        } else {
            clientSequenceNumber = this.submitChunkedMessage(type, serializedContent, maxOpSize);
        }

        return clientSequenceNumber;
    }

    private submitChunkedMessage(type: MessageType, content: string, maxOpSize: number): number {
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
            clientSequenceNumber = this.context.submitFn(MessageType.ChunkedOp, chunkedOp, false);
        }
        return clientSequenceNumber;
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }

    private processOperation(message: ISequencedDocumentMessage, local: boolean) {
        const envelope = message.contents as IEnvelope;
        const componentContext = this.contexts.get(envelope.address);
        assert(componentContext);
        const innerContents = envelope.contents as { content: any; type: string };

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: innerContents.content,
            metadata: message.metadata,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: innerContents.type,
        };

        componentContext.process(transformed, local);
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
                this.logger.sendErrorEvent({eventName: "ContainerRuntime_getScheduler"}, err);
            });

            this.context.quorum.on("removeMember", (clientId: string) => {
                if (this.leader) {
                    this.runTaskAnalyzer();
                }
            });
        }
    }

    private async getScheduler() {
        const schedulerRuntime = await this.getComponentRuntime(schedulerId, true);
        const schedulerResponse = await schedulerRuntime.request({ url: "" });
        const schedulerComponent = schedulerResponse.value as IComponent;
        return schedulerComponent.IAgentScheduler;
    }

    private updateLeader(leadership: boolean) {
        this._leader = leadership;
        if (this.leader) {
            assert(this.connected && this.deltaManager && this.deltaManager.active);
            this.emit("leader", this.clientId);
        } else {
            this.emit("noleader", this.clientId);
        }

        for (const [, context] of this.contexts) {
            context.updateLeader(this.leader);
        }
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
        if (this.clientId === undefined) {
            this.logger.sendErrorEvent({ eventName: "runTasksAnalyzerWithoutClientId" });
            return;
        }

        const helpTasks = analyzeTasks(this.clientId, this.getQuorum().getMembers(), this.tasks);
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
                this.submit(MessageType.RemoteHelp, remoteHelpMessage);
            }
        }
    }

    private async refreshLatestSummaryAck(context: ISummaryContext, referenceSequenceNumber: number) {
        if (referenceSequenceNumber < this.summaryTracker.referenceSequenceNumber) {
            return;
        }

        // Only called from summaries
        this.loadedFromSummary = true;

        const snapshotTree = new LazyPromise(async () => {
            // We have to call get version to get the treeId for r11s; this isnt needed
            // for odsp currently, since their treeId is undefined
            const versionsResult = await this.setOrLogError("FailedToGetVersion",
                async () => this.storage.getVersions(context.ackHandle, 1),
                (versions) => !!(versions && versions.length));

            if (versionsResult.success) {
                const snapshotResult = await this.setOrLogError("FailedToGetSnapshot",
                    async () => this.storage.getSnapshotTree(versionsResult.result[0]),
                    (snapshot) => !!snapshot);

                if (snapshotResult.success) {
                    return snapshotResult.result;
                }
            }
        });

        this.latestSummaryAck = context;
        await this.summaryTracker.refreshLatestSummary(referenceSequenceNumber, async () => snapshotTree);
    }

    private async setOrLogError<T>(
        eventName: string,
        setter: () => Promise<T>,
        validator: (result: T) => boolean,
    ): Promise<{ result: T; success: boolean }> {
        let result: T;
        let success = true;
        try {
            result = await setter();
        } catch (error) {
            // Send error event for exceptions
            this.logger.sendErrorEvent({ eventName }, error);
            success = false;
        }
        if (success && !validator(result)) {
            // Send error event when result is invalid
            this.logger.sendErrorEvent({ eventName });
            success = false;
        }
        return { result, success };
    }
}

// Wraps the provided list of packages and augments with some system level services.
class ContainerRuntimeComponentRegistry extends ComponentRegistry {

    constructor(namedEntries: NamedComponentRegistryEntries) {

        super([
            ...namedEntries,
            [schedulerId, Promise.resolve(new AgentSchedulerFactory())],
        ]);
    }

}
