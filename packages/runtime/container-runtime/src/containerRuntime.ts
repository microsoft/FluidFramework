/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentSchedulerFactory } from "@microsoft/fluid-agent-scheduler";
import {
    IComponent,
    IComponentHandleContext,
    IComponentSerializer,
    IRequest,
    IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    ConnectionState,
    IAudience,
    IBlobManager,
    IComponentTokenProvider,
    IContainerContext,
    IDeltaManager,
    IDeltaSender,
    ILoader,
    IMessageScheduler,
    IQuorum,
    IRuntime,
    ITelemetryLogger,
} from "@microsoft/fluid-container-definitions";
import {
    BlobTreeEntry,
    buildHierarchy,
    CommitTreeEntry,
    ComponentSerializer,
    Deferred,
    flatten,
    isSystemType,
    PerformanceEvent,
    raiseConnectedEvent,
    readAndParse,
} from "@microsoft/fluid-core-utils";
import {
    IChunkedOp,
    IDocumentMessage,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryConfiguration,
    ISummaryTree,
    ITree,
    MessageType,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import {
    ComponentFactoryTypes,
    ComponentRegistryTypes,
    FlushMode,
    IAttachMessage,
    IComponentRegistry,
    IComponentRuntime,
    IEnvelope,
    IHelpMessage,
    IHostRuntime,
    IInboundSignalMessage,
} from "@microsoft/fluid-runtime-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import { ComponentContext, LocalComponentContext, RemotedComponentContext } from "./componentContext";
import { ComponentHandleContext } from "./componentHandleContext";
import { debug } from "./debug";
import { DocumentStorageServiceProxy } from "./documentStorageServiceProxy";
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

interface ISummaryTreeWithStats {
    summaryStats: ISummaryStats;
    summaryTree: ISummaryTree;
}

interface IBufferedChunk {
    type: MessageType;

    content: string;
}

export interface IGeneratedSummaryData {
    sequenceNumber: number;

    /**
     * true if the summary op was submitted
     */
    submitted: boolean;

    summaryStats?: ISummaryStats;
}

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
    // Will eventually become the default and snapshots will be deprecated
    generateSummaries: boolean;
}

interface IRuntimeMessageMetadata {
    batch?: boolean;
}

class ScheduleManager {
    private readonly messageScheduler: IMessageScheduler | undefined;
    private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    private pauseSequenceNumber: number | undefined;
    private pauseClientId: string | undefined;

    private paused = false;
    private localPaused = false;
    private batchClientId: string;

    constructor(
        messageScheduler: IMessageScheduler | undefined,
        private readonly emitter: EventEmitter,
        legacyDeltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
    ) {
        if (!messageScheduler || !("toArray" in messageScheduler.deltaManager.inbound as any)) {
            this.deltaManager = legacyDeltaManager;
            return;
        }

        this.messageScheduler = messageScheduler;
        this.deltaManager = this.messageScheduler.deltaManager;

        // listen for delta manager sends and add batch metadata to messages
        this.deltaManager.on("prepareSend", (messages: IDocumentMessage[]) => {
            if (messages.length === 0) {
                return;
            }

            // First message will have the batch flag set to true if doing a batched send
            const firstMessageMetadata = messages[0].metadata as IRuntimeMessageMetadata;
            if (!firstMessageMetadata || !firstMessageMetadata.batch) {
                return;
            }

            // if only length one then clear
            if (messages.length === 1) {
                delete messages[0].metadata;
                return;
            }

            // set the batch flag to false on the last message to indicate the end of the send batch
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
        // If in legacy mode every operation is a batch
        if (!this.messageScheduler) {
            this.emitter.emit("batchBegin", message);
            return;
        }

        if (message.metadata === undefined) {
            // If there is no metadata, and no client ID set, then this is an individual batch. Otherwise it's a
            // message in the middle of a batch
            if (!this.batchClientId) {
                this.emitter.emit("batchBegin", message);
            }

            return;
        }

        // Otherwise we need to check for the metadata flag
        const metadata = message.metadata as IRuntimeMessageMetadata;
        if (metadata.batch === true) {
            this.batchClientId = message.clientId;
            this.emitter.emit("batchBegin", message);
        }
    }

    public endOperation(error: any | undefined, message: ISequencedDocumentMessage) {
        if (!this.messageScheduler || error) {
            this.batchClientId = undefined;
            this.emitter.emit("batchEnd", error, message);
            return;
        }

        this.updatePauseState(message.sequenceNumber);

        // If no batchClientId has been set then we're in an individual batch
        if (!this.batchClientId) {
            this.emitter.emit("batchEnd", undefined, message);
            return;
        }

        // As a back stop for any bugs marking the end of a batch - if the client ID flipped we consider the batch over
        if (this.batchClientId !== message.clientId) {
            this.emitter.emit("batchEnd", undefined, message);
            this.batchClientId = undefined;
            return;
        }

        // Otherwise need to check the metadata flag
        const batch = message.metadata ? (message.metadata as IRuntimeMessageMetadata).batch : undefined;
        if (batch === false) {
            this.batchClientId = undefined;
            this.emitter.emit("batchEnd", undefined, message);
        }
    }

    public pause(): Promise<void> {
        this.paused = true;
        return this.deltaManager.inbound.systemPause();
    }

    public resume() {
        this.paused = false;
        if (!this.localPaused) {
            // resume is only flipping the state but isn't concerned with the promise result
            // tslint:disable-next-line:no-floating-promises
            this.deltaManager.inbound.systemResume();
        }
    }

    private setPaused(localPaused: boolean) {
        // return early if no change in value
        if (this.localPaused === localPaused) {
            return;
        }

        this.localPaused = localPaused;
        const promise = localPaused || this.paused
            ? this.deltaManager.inbound.systemPause()
            : this.deltaManager.inbound.systemResume();

        // we do not care about "Resumed while waiting to pause" rejections.
        promise.catch((err) => {});
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
export class ContainerRuntime extends EventEmitter implements IHostRuntime, IRuntime {
    /**
     * Load the components from a snapshot and returns the runtime.
     * @param context - Context of the container.
     * @param registry - Mapping to the components.
     * @param requestHandlers - Request handlers for the container runtime
     * @param runtimeOptions - Additional options to be passed to the runtime
     */
    public static async load(
        context: IContainerContext,
        registry: ComponentRegistryTypes,
        requestHandlers: RuntimeRequestHandler[] = [],
        runtimeOptions?: IContainerRuntimeOptions,
    ): Promise<ContainerRuntime> {
        const componentRegistry = new WrappedComponentRegistry(registry);

        const chunkId = context.baseSnapshot.blobs[".chunks"];
        const chunks = chunkId
            ? await readAndParse<[string, string[]][]>(context.storage, chunkId)
            : [];

        const runtime = new ContainerRuntime(context, componentRegistry, chunks, runtimeOptions);
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

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.context.options;
    }

    public get clientId(): string {
        return this.context.clientId;
    }

    public get clientType(): string {
        return this.context.clientType;
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
        return this.submit;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this.context.submitSignalFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.context.snapshotFn;
    }

    public get closeFn(): () => void {
        return this.context.closeFn;
    }

    public get loader(): ILoader {
        return this.context.loader;
    }

    public get flushMode(): FlushMode {
        return this._flushMode;
    }

    public get IComponentRegistry(): IComponentRegistry {
        return this.registry;
    }

    public readonly IComponentSerializer: IComponentSerializer = new ComponentSerializer();

    public readonly IComponentHandleContext: IComponentHandleContext;

    public readonly logger: ITelemetryLogger;
    private readonly summaryManager: SummaryManager;
    private readonly summaryTreeConverter = new SummaryTreeConverter();

    private tasks: string[] = [];

    // back-compat: version decides between loading document and chaincode.
    private version: string;

    private _flushMode = FlushMode.Automatic;
    private needsFlush = false;
    private flushTrigger = false;

    private _leader = false;

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get leader(): boolean {
        if (this.connected && this.deltaManager && this.deltaManager.active) {
            return this._leader;
        }
        return false;
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

    // Local copy of sent but unacknowledged chunks.
    private readonly unackedChunkedMessages: Map<number, IBufferedChunk> = new Map<number, IBufferedChunk>();

    private loadedFromSummary: boolean;

    private constructor(
        private readonly context: IContainerContext,
        private readonly registry: IComponentRegistry,
        readonly chunks: [string, string[]][],
        private readonly runtimeOptions: IContainerRuntimeOptions = { generateSummaries: false },
    ) {
        super();

        this.chunkMap = new Map<string, string[]>(chunks);

        this.IComponentHandleContext = new ComponentHandleContext("", this);

        // Extract components stored inside the snapshot
        this.loadedFromSummary = context.baseSnapshot.trees[".protocol"] ? true : false;
        const components = new Map<string, ISnapshotTree | string>();
        if (this.loadedFromSummary) {
            Object.keys(context.baseSnapshot.trees).forEach((value) => {
                if (value !== ".protocol") {
                    const tree = context.baseSnapshot.trees[value];
                    components.set(value, tree);
                }
            });
        } else {
            Object.keys(context.baseSnapshot.commits).forEach((key) => {
                const moduleId = context.baseSnapshot.commits[key];
                components.set(key, moduleId);
            });
        }

        // Create a context for each of them
        for (const [key, value] of components) {
            const componentContext = new RemotedComponentContext(key, value, this, this.storage, this.context.scope);
            const deferred = new Deferred<ComponentContext>();
            deferred.resolve(componentContext);

            this.contexts.set(key, componentContext);
            this.contextsDeferred.set(key, deferred);
        }

        this.scheduleManager = new ScheduleManager(context.IMessageScheduler, this, context.deltaManager);
        this.deltaSender = this.deltaManager;

        this.logger = context.logger;

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

        this.context.on("refreshBaseSummary",
            (snapshot: ISnapshotTree) => this.refreshBaseSummary(snapshot));

        // We always create the summarizer in the case that we are asked to generate summaries. But this may
        // want to be on demand instead.
        // Don't use optimizations when generating summaries with a document loaded using snapshots.
        // This will ensure we correctly convert old documents.
        this.summarizer = new Summarizer(
            "/_summarizer",
            this,
            () => this.summaryConfiguration,
            () => this.generateSummary(!this.loadedFromSummary),
            (snapshot) => this.context.refreshBaseSummary(snapshot));

        // Create the SummaryManager and mark the initial state
        this.summaryManager = new SummaryManager(
            context,
            this.runtimeOptions.generateSummaries || this.loadedFromSummary,
            this.logger);
        if (this.context.connectionState === ConnectionState.Connected) {
            this.summaryManager.setConnected(this.context.clientId);
        }
    }
    public get IComponentTokenProvider() {

        // tslint:disable-next-line: no-unsafe-any
        if (this.options && this.options.intelligence) {
            return  {
                // tslint:disable-next-line: no-unsafe-any
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
        // Pull in the prior version and snapshot tree to store against
        const lastVersion = fullTree ? [] : await this.storage.getVersions(this.id, 1);
        const tree = lastVersion.length > 0
            ? await this.storage.getSnapshotTree(lastVersion[0])
            : { blobs: {}, commits: {}, trees: {} };

        // Iterate over each component and ask it to snapshot
        const componentVersionsP = Array.from(this.contexts).map(async ([componentId, value]) => {
            const snapshot = await value.snapshot();

            // If ID exists then previous commit is still valid
            const commit = tree.commits[componentId] as string;
            if (snapshot.id && commit && !fullTree) {
                return {
                    id: componentId,
                    version: commit,
                };
            } else {
                if (snapshot.id && !commit && !fullTree) {
                    this.logger.sendErrorEvent({
                        componentId,
                        eventName: "MissingCommit",
                        id: snapshot.id,
                    });
                }
                const parent = commit ? [commit] : [];
                const version = await this.storage.write(
                    snapshot, parent, `${componentId} commit ${tagMessage}`, componentId);

                return {
                    id: componentId,
                    version: version.id,
                };
            }
        });

        const root: ITree = { entries: [], id: null };

        // Add in module references to the component snapshots
        const componentVersions = await Promise.all(componentVersionsP);

        // Sort for better diffing of snapshots (in replay tool, used to find bugs in snapshotting logic)
        if (fullTree) {
            componentVersions.sort((a, b) => {
                return a.id.localeCompare(b.id);
            });
        }

        let gitModules = "";
        for (const componentVersion of componentVersions) {
            root.entries.push(new CommitTreeEntry(componentVersion.id, componentVersion.version));

            const repoUrl = "https://github.com/kurtb/praguedocs.git"; // this.storageService.repositoryUrl
            // tslint:disable-next-line: max-line-length
            gitModules += `[submodule "${componentVersion.id}"]\n\tpath = ${componentVersion.id}\n\turl = ${repoUrl}\n\n`;
        }

        if (this.chunkMap.size > 0) {
            root.entries.push(new BlobTreeEntry(".chunks", JSON.stringify([...this.chunkMap])));
        }

        // Write the module lookup details
        root.entries.push(new BlobTreeEntry(".gitmodules", gitModules));

        return root;
    }

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.context.requestSnapshot(tagMessage);
    }

    public async stop(): Promise<void> {
        this.verifyNotClosed();
        this.closed = true;
    }

    public changeConnectionState(value: ConnectionState, clientId: string, version: string) {
        this.verifyNotClosed();

        assert(this.connectionState === value);

        if (value === ConnectionState.Connected) {
            // Resend all pending attach messages prior to notifying clients
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }

            // Also send any unacked chunk messages
            this.sendUnackedChunks();
        }

        for (const [, componentContext] of this.contexts) {
            componentContext.changeConnectionState(value, clientId);
        }

        raiseConnectedEvent(this, value, clientId);

        if (value === ConnectionState.Connected) {
            this.summaryManager.setConnected(clientId);
        } else {
            if (this._leader) {
                this.updateLeader(false);
            }
            this.summaryManager.setDisconnected();
        }
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.context.IMessageScheduler
            ? Promise.reject("Scheduler assumes only process")
            : Promise.resolve();
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

    public postProcess(message: ISequencedDocumentMessage, local: boolean, context: any) {
        return this.context.IMessageScheduler
            ? Promise.reject("Scheduler assumes only process")
            : Promise.resolve();
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as IEnvelope;
        const context = this.contexts.get(envelope.address);
        assert(context);

        const innerContent = envelope.contents as { content: any, type: string };
        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: innerContent.content,
            type: innerContent.type,
        };

        context.processSignal(transformed, local);
    }

    public async getComponentRuntime(id: string, wait = true): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        if (!this.contextsDeferred.has(id)) {
            if (!wait) {
                return Promise.reject(`Process ${id} does not exist`);
            }

            // Add in a deferred that will resolve once the process ID arrives
            this.contextsDeferred.set(id, new Deferred<ComponentContext>());
        }

        const componentContext = await this.contextsDeferred.get(id).promise;
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
        // case this invokation doesn't own
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

    // tslint:disable-next-line: function-name
    public async _createComponentWithProps(pkg: string | string[], props: any, id: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const context = new LocalComponentContext(
            id,
            Array.isArray(pkg) ? pkg : [pkg],
            this,
            this.storage,
            this.context.scope,
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
        this.context.error(error);
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

    /* tslint:disable:no-unnecessary-override */
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

    private refreshBaseSummary(snapshot: ISnapshotTree) {
        // currently only is called from summaries
        this.loadedFromSummary = true;
        // propogate updated tree to all components
        for (const key of Object.keys(snapshot.trees)) {
            if (this.contexts.has(key)) {
                const component = this.contexts.get(key);
                component.refreshBaseSummary(snapshot.trees[key]);
            }
        }
    }

    /**
     * Returns a summary of the runtime at the current sequence number.
     */
    private async summarize(fullTree: boolean = false): Promise<ISummaryTreeWithStats> {
        const summaryTree: ISummaryTree = {
            tree: {},
            type: SummaryType.Tree,
        };
        let summaryStats = this.summaryTreeConverter.mergeStats();

        // Iterate over each component and ask it to snapshot
        await Promise.all(Array.from(this.contexts).map(async ([key, value]) => {
            const snapshot = await value.snapshot(fullTree);
            const treeWithStats = this.summaryTreeConverter.convertToSummaryTree(
                snapshot,
                fullTree);
            summaryTree.tree[key] = treeWithStats.summaryTree;
            summaryStats = this.summaryTreeConverter.mergeStats(summaryStats, treeWithStats.summaryStats);
        }));

        if (this.chunkMap.size > 0) {
            summaryTree.tree[".chunks"] = {
                content: JSON.stringify([...this.chunkMap]),
                type: SummaryType.Blob,
            };
        }

        summaryStats.treeNodeCount++; // add this root tree node
        return { summaryStats, summaryTree };
    }

    private processCore(message: ISequencedDocumentMessage, local: boolean) {
        let remotedComponentContext: RemotedComponentContext;

        // Chunk processing must come first given that we will transform the message to the unchunked version
        // once all pieces are available
        if (message.type === MessageType.ChunkedOp) {
            const chunkComplete = this.processRemoteChunkedMessage(message);
            if (chunkComplete && local) {
                const clientSeqNumber = message.clientSequenceNumber;
                if (this.unackedChunkedMessages.has(clientSeqNumber)) {
                    this.unackedChunkedMessages.delete(clientSeqNumber);
                }
            }
        }

        // Old prepare part
        switch (message.type) {
            case MessageType.Attach:
                // the local object has already been attached
                if (local) {
                    break;
                }

                const attachMessage = message.contents as IAttachMessage;
                const flatBlobs = new Map<string, string>();
                let snapshotTree: ISnapshotTree = null;
                if (attachMessage.snapshot) {
                    const flattened = flatten(attachMessage.snapshot.entries, flatBlobs);
                    snapshotTree = buildHierarchy(flattened);
                }

                remotedComponentContext = new RemotedComponentContext(
                    attachMessage.id,
                    snapshotTree,
                    this,
                    new DocumentStorageServiceProxy(this.storage, flatBlobs),
                    this.context.scope);

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

                    // equivalent of nextTick() - Prefetch once all current ops have completed
                    // tslint:disable-next-line:no-floating-promises
                    Promise.resolve().then(() => remotedComponentContext.realize());
                }

            default:
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

    private async generateSummary(fullTree: boolean = false): Promise<IGeneratedSummaryData> {
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

        if (!("uploadSummary" in this.context.storage)) {
            this.logger.sendTelemetryEvent({ eventName: "SkipGenerateSummaryNotSupported" });
            return;
        }

        const generateSummaryEvent = PerformanceEvent.start(this.logger, {
            eventName: "GenerateSummary",
            fullTree,
        });

        try {
            await this.scheduleManager.pause();
            const sequenceNumber = this.deltaManager.referenceSequenceNumber;

            const ret: IGeneratedSummaryData = {
                sequenceNumber,
                submitted: false,
                summaryStats: undefined,
            };

            if (!this.connected) {
                return ret;
            }
            // TODO in the future we can have stored the latest summary by listening to the summary ack message
            // after loading from the beginning of the snapshot
            const versions = await this.context.storage.getVersions(this.id, 1);
            const parents = versions.map((version) => version.id);
            generateSummaryEvent.reportProgress({}, "loadedVersions");

            const treeWithStats = await this.summarize(fullTree);
            ret.summaryStats = treeWithStats.summaryStats;
            generateSummaryEvent.reportProgress({}, "generatedTree");

            if (!this.connected) {
                return ret;
            }
            const handle = await this.context.storage.uploadSummary(treeWithStats.summaryTree);
            const summary = {
                handle: handle.handle,
                head: parents[0],
                message,
                parents,
            };
            generateSummaryEvent.reportProgress({}, "uploadedTree");

            if (!this.connected) {
                return ret;
            }
            // if summarizer loses connection it will never reconnect
            this.submit(MessageType.Summarize, summary);
            ret.submitted = true;

            generateSummaryEvent.end({
                sequenceNumber,
                submitted: ret.submitted,
                handle: handle.handle,
                ...ret.summaryStats,
            });
            return ret;
        } catch (ex) {
            generateSummaryEvent.cancel({}, ex);
            throw ex;
        } finally {
            // Restart the delta manager
            this.scheduleManager.resume();
        }
    }

    private sendUnackedChunks() {
        for (const message of this.unackedChunkedMessages) {
            debug(`Resending unacked chunks!`);
            this.submitChunkedMessage(
                message[1].type,
                message[1].content,
                this.context.deltaManager.maxMessageSize);
        }
    }

    private processRemoteChunkedMessage(message: ISequencedDocumentMessage): boolean {
        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent.contents);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            const serializedContent = this.chunkMap.get(clientId).join("");
            message.contents = JSON.parse(serializedContent);
            message.type = chunkedContent.originalType;
            this.clearPartialChunks(clientId);
            return true;
        }
        return false;
    }

    private addChunk(clientId: string, chunkedContent: string) {
        if (!this.chunkMap.has(clientId)) {
            this.chunkMap.set(clientId, []);
        }
        this.chunkMap.get(clientId).push(chunkedContent);
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
                // tslint:disable-next-line:no-floating-promises
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
            this.unackedChunkedMessages.set(clientSequenceNumber,
                {
                    content: serializedContent,
                    type,
                });
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
        const innerContents = envelope.contents as { content: any, type: string };

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
        if (this.context.configuration === undefined || this.context.configuration.canReconnect) {
            this.getScheduler().then((scheduler) => {
                if (scheduler.leader) {
                    this.updateLeader(true);
                } else {
                    scheduler.on("leader", () => {
                        this.updateLeader(true);
                    });
                }
            }, (err) => {
                debug(err);
            });
            this.context.quorum.on("removeMember", (clientId: string) => {
                if (clientId === this.clientId && this._leader) {
                    this.updateLeader(false);
                } else if (this.leader) {
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
        if (this._leader) {
            this.emit("leader", this.clientId);
        } else {
            this.emit("noleader", this.clientId);
        }

        for (const [, context] of this.contexts) {
            context.updateLeader(this._leader);
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
                    version: this.version,   // back-compat
                };
                debug(`Requesting local help for ${helpTasks.browser}`);
                this.emit("localHelp", localHelpMessage);
            }
            if (helpTasks.robot.length > 0) {
                const remoteHelpMessage: IHelpMessage = {
                    tasks: helpTasks.robot,
                    version: this.version,   // back-compat
                };
                debug(`Requesting remote help for ${helpTasks.robot}`);
                this.submit(MessageType.RemoteHelp, remoteHelpMessage);
            }
        }
    }
}

// Wraps the provided list of packages and augments with some system level services.
export class WrappedComponentRegistry implements IComponentRegistry {

    private readonly agentScheduler: AgentSchedulerFactory;

    constructor(private readonly registry: ComponentRegistryTypes,
                private readonly extraRegistries?: Map<string, Promise<ComponentFactoryTypes>>) {
        this.agentScheduler = new AgentSchedulerFactory();
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<ComponentFactoryTypes> {
        if (name === schedulerId) {
            return this.agentScheduler;
        } else if (this.extraRegistries && this.extraRegistries.has(name)) {
            return this.extraRegistries.get(name);
        } else {
            return this.registry.get(name);
        }
    }
}
