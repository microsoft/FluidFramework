/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { AgentSchedulerFactory } from "@microsoft/fluid-agent-scheduler";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
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
    ContainerWarning,
    CriticalContainerError,
} from "@microsoft/fluid-container-definitions";
import { IContainerRuntime } from "@microsoft/fluid-container-runtime-definitions";
import {
    Deferred,
    Trace,
    LazyPromise,
    ChildLogger,
    raiseConnectedEvent,
} from "@fluidframework/common-utils";
import {
    IDocumentStorageService,
    ISummaryContext,
} from "@microsoft/fluid-driver-definitions";
import { readAndParse, CreateContainerError } from "@microsoft/fluid-driver-utils";
import {
    BlobTreeEntry,
    buildSnapshotTree,
    isSystemType,
    TreeTreeEntry,
} from "@microsoft/fluid-protocol-base";
import {
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
    IComponentContext,
    IComponentRegistry,
    IComponentRuntimeChannel,
    IEnvelope,
    IInboundSignalMessage,
    ISignalEnvelop,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ComponentSerializer, SummaryTracker } from "@microsoft/fluid-runtime-utils";
import { v4 as uuid } from "uuid";
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
import { ISummarizerRuntime, Summarizer } from "./summarizer";
import { SummaryManager } from "./summaryManager";
import { ISummaryStats, SummaryTreeConverter } from "./summaryTreeConverter";
import { analyzeTasks } from "./taskAnalyzer";
import { DeltaScheduler } from "./deltaScheduler";
import { ReportConnectionTelemetry } from "./connectionTelemetry";
import { SummaryCollection } from "./summaryCollection";
import { pkgVersion } from "./packageVersion";

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
    // Flag that will generate summaries if connected to a service that supports them.
    // This defaults to true and must be explicitly set to false to disable.
    generateSummaries?: boolean;

    // Experimental flag that will execute tasks in web worker if connected to a service that supports them.
    enableWorker?: boolean;
}

interface IRuntimeMessageMetadata {
    batch?: boolean;
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

export class ScheduleManager {
    private readonly deltaScheduler: DeltaScheduler;
    private pauseSequenceNumber: number | undefined;
    private pauseClientId: string | undefined;

    private paused = false;
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

export const schedulerId = "_scheduler";
const schedulerRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length > 0 && request.pathParts[0] === schedulerId) {
            return componentRuntimeRequestHandler(request, runtime);
        }
        return undefined;
    };

// Wraps the provided list of packages and augments with some system level services.
class ContainerRuntimeComponentRegistry extends ComponentRegistry {
    constructor(namedEntries: NamedComponentRegistryEntries) {
        super([
            ...namedEntries,
            [schedulerId, Promise.resolve(new AgentSchedulerFactory())],
        ]);
    }
}

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 * It will define the component level mappings.
 */
export class ContainerRuntime extends EventEmitter implements IContainerRuntime, IRuntime, ISummarizerRuntime {
    public readonly isExperimentalRuntime = true;
    public readonly isExperimentalContainerRuntime = true;
    public get IContainerRuntime() { return this; }

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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ? await readAndParse<[string, string[]][]>(context.storage!, chunkId)
            : [];

        const runtime = new ContainerRuntime(context, componentRegistry, chunks, runtimeOptions, containerScope);
        runtime.requestHandler.pushHandler(
            createLoadableComponentRuntimeRequestHandler(runtime.summarizer),
            schedulerRuntimeRequestHandler,
            ...requestHandlers);

        // Create all internal components in first load.
        if (!context.existing) {
            await runtime.createComponent(schedulerId, schedulerId)
                .then((componentRuntime) => {
                    componentRuntime.attach();
                });
        }

        runtime.subscribeToLeadership();

        return runtime;
    }

    public get id(): string {
        return this.context.id;
    }

    public get parentBranch(): string | null {
        return this.context.parentBranch;
    }

    public get existing(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.existing!;
    }

    public get options(): any {
        return this.context.options;
    }

    public get clientId(): string | undefined {
        return this.context.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.context.clientDetails;
    }

    public get blobManager(): IBlobManager {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.blobManager!;
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

    public get closeFn(): (error?: CriticalContainerError) => void {
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

    public isLocal(): boolean {
        return this.context.isLocal();
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
    private version: string | undefined;

    private _flushMode = FlushMode.Automatic;
    private needsFlush = false;
    private flushTrigger = false;

    // Always matched IAgentScheduler.leader property
    private _leader = false;

    public get connected(): boolean {
        return this.context.connected;
    }

    public get leader(): boolean {
        return this._leader;
    }

    public get summarizerClientId(): string | undefined {
        return this.summaryManager.summarizer;
    }

    private get summaryConfiguration() {
        return this.context.serviceConfiguration
            ? { ...DefaultSummaryConfiguration, ...this.context.serviceConfiguration.summary }
            : DefaultSummaryConfiguration;
    }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    // Components tracked by the Domain
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private dirtyDocument = false;
    private readonly summarizer: Summarizer;
    private readonly deltaSender: IDeltaSender | undefined;
    private readonly scheduleManager: ScheduleManager;
    private readonly requestHandler = new RuntimeRequestHandlerBuilder();

    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    // Attached and loaded context proxies
    private readonly contexts = new Map<string, ComponentContext>();
    // List of pending contexts (for the case where a client knows a component will exist and is waiting
    // on its creation). This is a superset of contexts.
    private readonly contextsDeferred = new Map<string, Deferred<ComponentContext>>();

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
        const useContext: boolean = this.isLocal() ? true : this.storage.uploadSummaryWithContext !== undefined;
        this.latestSummaryAck = {
            proposalHandle: undefined,
            ackHandle: this.context.getLoadedFromVersion()?.id,
        };
        this.summaryTracker = new SummaryTracker(
            useContext,
            "", // fullPath - the root is unnamed
            this.deltaManager.initialSequenceNumber, // referenceSequenceNumber - last acked summary ref seq number
            this.deltaManager.initialSequenceNumber, // latestSequenceNumber - latest sequence number seen
            async () => undefined, // getSnapshotTree - this will be replaced on summary ack
        );
        this.summaryTreeConverter = new SummaryTreeConverter(useContext);

        // Extract components stored inside the snapshot
        const components = new Map<string, ISnapshotTree | string>();
        if (context.baseSnapshot) {
            const baseSnapshot = context.baseSnapshot;
            Object.keys(baseSnapshot.trees).forEach((value) => {
                if (value !== ".protocol") {
                    const tree = baseSnapshot.trees[value];
                    components.set(value, tree);
                }
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

        this.logger = ChildLogger.create(context.logger, undefined, {
            runtimeVersion: pkgVersion,
        });

        this.scheduleManager = new ScheduleManager(
            context.deltaManager,
            this,
            ChildLogger.create(this.logger, "ScheduleManager"),
        );

        this.deltaSender = this.deltaManager;

        this.deltaManager.on("allSentOpsAckd", () => {
            // If we are not fully connected, then we have no clue if there are any pending ops
            // to be resubmitted. Wait for "connected" event to get that info.
            // Not ideal, but it's better to have false negatives then false positives.
            // We will mark document clean on becoming "connected".
            if (this.connected) {
                this.updateDocumentDirtyState(false);
            }
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
            async (full: boolean, safe: boolean) => this.generateSummary(full, safe),
            async (summContext, refSeq) => this.refreshLatestSummaryAck(summContext, refSeq),
            this.previousState.summaryCollection);

        // Create the SummaryManager and mark the initial state
        this.summaryManager = new SummaryManager(
            context,
            this.runtimeOptions.generateSummaries !== false,
            !!this.runtimeOptions.enableWorker,
            this.logger,
            (summarizer) => { this.nextSummarizerP = summarizer; },
            this.previousState.nextSummarizerP,
            !!this.previousState.reload);

        if (this.context.connected) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.summaryManager.setConnected(this.context.clientId!);
        }

        ReportConnectionTelemetry(this.context.clientId, this.deltaManager, this.logger);
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.summaryManager.dispose();
        this.summarizer.dispose();

        // close/stop all component contexts
        for (const [componentId, contextD] of this.contextsDeferred) {
            contextD.promise.then((context) => {
                context.dispose();
            }).catch((contextError) => {
                this.logger.sendErrorEvent({ eventName: "ComponentContextDisposeError", componentId }, contextError);
            });
        }

        this.emit("dispose");
        this.removeAllListeners();
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

        const snapshot = await this.snapshot("", true);
        const state: IPreviousState = {
            reload: true,
            summaryCollection: this.summarizer.summaryCollection,
            nextSummarizerP: this.nextSummarizerP,
            nextSummarizerD: this.nextSummarizerD,
        };

        this.dispose();

        return { snapshot, state };
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        assert(this.connected === connected);

        if (connected) {
            // Once we are connected, all acks are accounted.
            // If there are any pending ops, DDSs will resubmit them right away (below) and
            // we will switch back to dirty state in such case.
            this.updateDocumentDirtyState(false);

            // Resend all pending attach messages prior to notifying clients
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [component, componentContext] of this.contexts) {
            try {
                componentContext.setConnectionState(connected, clientId);
            } catch (error) {
                this.logger.sendErrorEvent({
                    eventName: "ChangeConnectionStateError",
                    clientId,
                    component,
                }, error);
            }
        }

        raiseConnectedEvent(this.logger, this, connected, clientId);

        if (connected) {
            assert(clientId);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.summaryManager.setConnected(clientId!);
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
        const envelope = message.content as ISignalEnvelop;
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

    public async getComponentRuntime(id: string, wait = true): Promise<IComponentRuntimeChannel> {
        // Ensure deferred if it doesn't exist which will resolve once the process ID arrives
        const deferredContext = this.ensureContextDeferred(id);

        if (!wait && !deferredContext.isCompleted) {
            return Promise.reject(`Process ${id} does not exist`);
        }

        const componentContext = await deferredContext.promise;
        return componentContext.realize();
    }

    public notifyComponentInstantiated(componentContext: IComponentContext) {
        const componentPkgName = componentContext.packagePath[componentContext.packagePath.length - 1];
        const registryPath =
            `/${componentContext.packagePath.slice(0,componentContext.packagePath.length - 1).join("/")}`;
        this.emit("componentInstantiated", componentPkgName, registryPath, !componentContext.existing);
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

    /**
     * @deprecated
     * Remove once issue #1756 is closed
     */
    public async createComponent(idOrPkg: string, maybePkg: string | string[]) {
        const id = maybePkg === undefined ? uuid() : idOrPkg;
        const pkg = maybePkg === undefined ? idOrPkg : maybePkg;
        return this._createComponentWithProps(pkg, undefined, id);
    }

    public async _createComponentWithProps(pkg: string | string[], props?: any, id?: string):
    Promise<IComponentRuntimeChannel> {
        return this._createComponentContext(Array.isArray(pkg) ? pkg : [pkg], props, id).realize();
    }

    public createComponentContext(pkg: string[], props?: any): IComponentContext {
        return this._createComponentContext(pkg, props);
    }

    private _createComponentContext(pkg: string[], props?: any, id = uuid()) {
        this.verifyNotClosed();

        assert(!this.contexts.has(id), "Creating component with existing ID");

        const context = new LocalComponentContext(
            id,
            pkg,
            this,
            this.storage,
            this.containerScope,
            this.summaryTracker.createOrGetChild(id, this.deltaManager.referenceSequenceNumber),
            (cr: IComponentRuntimeChannel) => this.attachComponent(cr),
            props);

        const deferred = new Deferred<ComponentContext>();
        this.contextsDeferred.set(id, deferred);
        this.contexts.set(id, context);

        return context;
    }

    public async createComponentWithRealizationFn(
        pkg: string[],
        realizationFn?: (context: IComponentContext) => void,
    ): Promise<IComponentRuntimeChannel> {
        this.verifyNotClosed();

        // tslint:disable-next-line: no-unsafe-any
        const id: string = uuid();
        const context = new LocalComponentContext(
            id,
            pkg,
            this,
            this.storage,
            this.containerScope,
            this.summaryTracker.createOrGetChild(id, this.deltaManager.referenceSequenceNumber),
            (cr: IComponentRuntimeChannel) => this.attachComponent(cr),
            undefined /* #1635: Remove LocalComponentContext createProps */);

        const deferred = new Deferred<ComponentContext>();
        this.contextsDeferred.set(id, deferred);
        this.contexts.set(id, context);

        if (realizationFn) {
            return context.realizeWithFn(realizationFn);
        } else {
            return context.realize();
        }
    }

    public getQuorum(): IQuorum {
        return this.context.quorum;
    }

    public getAudience(): IAudience {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.context.audience!;
    }

    public raiseContainerWarning(error: ContainerWarning) {
        this.context.raiseContainerWarning(error);
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
        const envelope: ISignalEnvelop = { address: undefined, contents: { type, content } };
        return this.context.submitSignalFn(envelope);
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
        await Promise.all(Array.from(this.contexts)
            .filter(([key, value]) =>
                value.isAttached,
            )
            .map(async ([key, value]) => {
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
            case MessageType.Attach: {
                // The local object has already been attached
                if (local) {
                    break;
                }

                const attachMessage = message.contents as IAttachMessage;
                const flatBlobs = new Map<string, string>();
                let snapshotTree: ISnapshotTree | null = null;
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
            }

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
            case MessageType.Attach: {
                const attachMessage = message.contents as IAttachMessage;

                // If a non-local operation then go and create the object, otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(attachMessage.id));
                    this.pendingAttach.delete(attachMessage.id);
                } else {
                    assert(!this.contexts.has(attachMessage.id), "Component attached with existing ID");

                    // Resolve pending gets and store off any new ones
                    const deferred = this.ensureContextDeferred(attachMessage.id);
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    deferred.resolve(remotedComponentContext!);
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.contexts.set(attachMessage.id, remotedComponentContext!);

                    // Equivalent of nextTick() - Prefetch once all current ops have completed
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises, @typescript-eslint/promise-function-async
                    Promise.resolve().then(() => remotedComponentContext.realize());
                }
                break;
            }

            default: // Do nothing
        }
    }

    private attachComponent(componentRuntime: IComponentRuntimeChannel): void {
        this.verifyNotClosed();

        const context = this.getContext(componentRuntime.id);
        if (context.isAttached) {
            return;
        }
        // If storage is not available then we are not yet fully attached and so will defer to the initial snapshot
        if (!this.isLocal()) {
            const message = context.generateAttachMessage();

            this.pendingAttach.set(componentRuntime.id, message);
            if (this.connected) {
                this.submit(MessageType.Attach, message);
            }
        }

        // Resolve the deferred so other local components can access it.
        const deferred = this.getContextDeferred(componentRuntime.id);
        deferred.resolve(context);
    }

    private ensureContextDeferred(id: string): Deferred<ComponentContext> {
        const deferred = this.contextsDeferred.get(id);
        if (deferred) { return deferred; }
        const newDeferred = new Deferred<ComponentContext>();
        this.contextsDeferred.set(id, newDeferred);
        return newDeferred;
    }

    private getContextDeferred(id: string): Deferred<ComponentContext> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const deferred = this.contextsDeferred.get(id)!;
        assert(deferred);
        return deferred;
    }

    private getContext(id: string): ComponentContext {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const context = this.contexts.get(id)!;
        assert(context);
        return context;
    }

    public createSummary(): ISummaryTree {
        const summaryTree: ISummaryTree = {
            tree: {},
            type: SummaryType.Tree,
        };

        // Iterate over each component and ask it to snapshot
        Array.from(this.contexts)
            .filter(([key, value]) =>
                value.isAttached,
            )
            .map(async ([key, value]) => {
                const snapshot = value.generateAttachMessage().snapshot;
                const treeWithStats = this.summaryTreeConverter.convertToSummaryTree(
                    snapshot,
                    `/${encodeURIComponent(key)}`,
                    true,
                );
                summaryTree.tree[key] = treeWithStats.summaryTree;
            });
        if (this.chunkMap.size > 0) {
            summaryTree.tree[".chunks"] = {
                content: JSON.stringify([...this.chunkMap]),
                type: SummaryType.Blob,
            };
        }
        return summaryTree;
    }

    private async generateSummary(
        fullTree: boolean = false,
        safe: boolean = false,
    ): Promise<GenerateSummaryData | undefined> {
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
                handle = await this.storage.uploadSummaryWithContext(
                    treeWithStats.summaryTree,
                    this.latestSummaryAck);
            } else {
                // back-compat: 0.14 uploadSummary
                const summaryHandle = await this.storage.uploadSummary(
                    treeWithStats.summaryTree);
                handle = summaryHandle.handle;
            }

            // safe mode refreshes the latest summary ack
            if (safe) {
                const versions = await this.storage.getVersions(this.id, 1);
                const parents = versions.map((version) => version.id);
                await this.refreshLatestSummaryAck(
                    { proposalHandle: undefined, ackHandle: parents[0] },
                    this.summaryTracker.referenceSequenceNumber);
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

    /**
     * Throw an error if the runtime is closed.  Methods that are expected to potentially
     * be called after dispose due to asynchrony should not call this.
     */
    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }

    private processOperation(message: ISequencedDocumentMessage, local: boolean) {
        const envelope = message.contents as IEnvelope;
        const componentContext = this.getContext(envelope.address);
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
            term: message.term ?? 1,
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
                this.closeFn(CreateContainerError(err));
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return schedulerComponent.IAgentScheduler!;
    }

    private updateLeader(leadership: boolean) {
        this._leader = leadership;
        assert(this.clientId);
        if (this.leader) {
            assert(this.connected && this.deltaManager && this.deltaManager.active);
            this.emit("leader");
        } else {
            this.emit("notleader");
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

        const snapshotTree = new LazyPromise(async () => {
            // We have to call get version to get the treeId for r11s; this isn't needed
            // for odsp currently, since their treeId is undefined
            const versionsResult = await this.setOrLogError("FailedToGetVersion",
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                async () => this.storage.getVersions(context.ackHandle!, 1),
                (versions) => !!(versions && versions.length));

            if (versionsResult.success) {
                const snapshotResult = await this.setOrLogError("FailedToGetSnapshot",
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    async () => this.storage.getSnapshotTree(versionsResult.result![0]),
                    (snapshot) => !!snapshot);

                if (snapshotResult.success) {
                    // Translate null to undefined
                    return snapshotResult.result ?? undefined;
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
    ): Promise<{ result: T | undefined; success: boolean }> {
        let result: T;
        try {
            result = await setter();
        } catch (error) {
            // Send error event for exceptions
            this.logger.sendErrorEvent({ eventName }, error);
            return { result: undefined, success: false };
        }

        const success = validator(result);

        if (!success) {
            // Send error event when result is invalid
            this.logger.sendErrorEvent({ eventName });
        }
        return { result, success };
    }
}
