/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import merge from "lodash/merge";
import { v4 as uuid } from "uuid";
import {
    IDisposable, ITelemetryLogger, ITelemetryProperties,
} from "@fluidframework/common-definitions";
import { assert, performance, unreachableCase } from "@fluidframework/common-utils";
import {
    IRequest,
    IResponse,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IConnectionDetails,
    IContainer,
    IContainerEvents,
    IDeltaManager,
    ICriticalContainerError,
    ContainerWarning,
    AttachState,
    IThrottlingWarning,
    ReadOnlyInfo,
    IContainerLoadMode,
    IFluidCodeDetails,
    isFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
    DataCorruptionError,
    extractSafePropertiesFromMessage,
    GenericError,
    UsageError,
} from "@fluidframework/container-utils";
import {
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import {
    readAndParse,
    OnlineStatus,
    isOnline,
    ensureFluidResolvedUrl,
    combineAppAndProtocolSummary,
    runWithRetry,
    isFluidResolvedUrl,
    isRuntimeMessage,
    isUnpackedRuntimeMessage,
} from "@fluidframework/driver-utils";
import { IQuorumSnapshot } from "@fluidframework/protocol-base";
import {
    IClient,
    IClientConfiguration,
    IClientDetails,
    ICommittedProposal,
    IDocumentAttributes,
    IDocumentMessage,
    IProcessMessageResult,
    IProtocolState,
    IQuorumClients,
    IQuorumProposals,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ISummaryContent,
    ISummaryTree,
    IVersion,
    MessageType,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    ChildLogger,
    EventEmitterWithErrorHandling,
    PerformanceEvent,
    raiseConnectedEvent,
    TelemetryLogger,
    connectedEventName,
    disconnectedEventName,
    normalizeError,
    MonitoringContext,
    loggerToMonitoringContext,
    wrapError,
} from "@fluidframework/telemetry-utils";
import { Audience } from "./audience";
import { ContainerContext } from "./containerContext";
import { ReconnectMode, IConnectionManagerFactoryArgs, getPackageName } from "./contracts";
import { DeltaManager, IConnectionArgs } from "./deltaManager";
import { DeltaManagerProxy } from "./deltaManagerProxy";
import { ILoaderOptions, Loader, RelativeLoader } from "./loader";
import { pkgVersion } from "./packageVersion";
import { ConnectionStateHandler } from "./connectionStateHandler";
import { RetriableDocumentStorageService } from "./retriableDocumentStorageService";
import { ProtocolTreeStorageService } from "./protocolTreeDocumentStorageService";
import { BlobOnlyStorage, ContainerStorageAdapter } from "./containerStorageAdapter";
import { getProtocolSnapshotTree, getSnapshotTreeFromSerializedContainer } from "./utils";
import { initQuorumValuesFromCodeDetails, getCodeDetailsFromQuorumValues, QuorumProxy } from "./quorum";
import { CollabWindowTracker } from "./collabWindowTracker";
import { ConnectionManager } from "./connectionManager";
import { ConnectionState } from "./connectionState";
import {
    IProtocolHandler,
    ProtocolHandler,
    ProtocolHandlerBuilder,
} from "./protocol";

const detachedContainerRefSeqNumber = 0;

const dirtyContainerEvent = "dirty";
const savedContainerEvent = "saved";

export interface IContainerLoadOptions {
    /**
     * Disables the Container from reconnecting if false, allows reconnect otherwise.
     */
    canReconnect?: boolean;
    /**
     * Client details provided in the override will be merged over the default client.
     */
    clientDetailsOverride?: IClientDetails;
    resolvedUrl: IFluidResolvedUrl;
    /**
     * Control which snapshot version to load from.  See IParsedUrl for detailed information.
     */
    version: string | undefined;
    /**
     * Loads the Container in paused state if true, unpaused otherwise.
     */
    loadMode?: IContainerLoadMode;
}

export interface IContainerConfig {
    resolvedUrl?: IFluidResolvedUrl;
    canReconnect?: boolean;
    /**
     * Client details provided in the override will be merged over the default client.
     */
    clientDetailsOverride?: IClientDetails;
    /**
     * Serialized state from a previous instance of this container
     */
    serializedContainerState?: IPendingContainerState;
}

/**
 * Waits until container connects to delta storage and gets up-to-date
 * Useful when resolving URIs and hitting 404, due to container being loaded from (stale) snapshot and not being
 * up to date. Host may chose to wait in such case and retry resolving URI.
 * Warning: Will wait infinitely for connection to establish if there is no connection.
 * May result in deadlock if Container.disconnect() is called and never followed by a call to Container.connect().
 * @returns true: container is up to date, it processed all the ops that were know at the time of first connection
 *          false: storage does not provide indication of how far the client is. Container processed
 *          all the ops known to it, but it maybe still behind.
 * @throws an error beginning with `"Container closed"` if the container is closed before it catches up.
 */
export async function waitContainerToCatchUp(container: IContainer) {
    // Make sure we stop waiting if container is closed.
    if (container.closed) {
        throw new UsageError("waitContainerToCatchUp: Container closed");
    }

    return new Promise<boolean>((resolve, reject) => {
        const deltaManager = container.deltaManager;

        const closedCallback = (err?: ICriticalContainerError | undefined) => {
            container.off("closed", closedCallback);
            const baseMessage = "Container closed while waiting to catch up";
            reject(
                err !== undefined
                    ? wrapError(err, (innerMessage) => new GenericError(`${baseMessage}: ${innerMessage}`))
                    : new GenericError(baseMessage),
            );
        };
        container.on("closed", closedCallback);

        const waitForOps = () => {
            assert(container.connectionState === ConnectionState.CatchingUp
                || container.connectionState === ConnectionState.Connected,
                0x0cd /* "Container disconnected while waiting for ops!" */);
            const hasCheckpointSequenceNumber = deltaManager.hasCheckpointSequenceNumber;

            const connectionOpSeqNumber = deltaManager.lastKnownSeqNumber;
            assert(deltaManager.lastSequenceNumber <= connectionOpSeqNumber,
                0x266 /* "lastKnownSeqNumber should never be below last processed sequence number" */);
            if (deltaManager.lastSequenceNumber === connectionOpSeqNumber) {
                container.off("closed", closedCallback);
                resolve(hasCheckpointSequenceNumber);
                return;
            }
            const callbackOps = (message: ISequencedDocumentMessage) => {
                if (connectionOpSeqNumber <= message.sequenceNumber) {
                    container.off("closed", closedCallback);
                    resolve(hasCheckpointSequenceNumber);
                    deltaManager.off("op", callbackOps);
                }
            };
            deltaManager.on("op", callbackOps);
        };

        // We can leverage DeltaManager's "connect" event here and test for ConnectionState.Disconnected
        // But that works only if service provides us checkPointSequenceNumber
        // Our internal testing is based on R11S that does not, but almost all tests connect as "write" and
        // use this function to catch up, so leveraging our own join op as a fence/barrier
        if (container.connectionState === ConnectionState.Connected) {
            waitForOps();
            return;
        }

        const callback = () => {
            container.off(connectedEventName, callback);
            waitForOps();
        };
        container.on(connectedEventName, callback);

        if (container.connectionState === ConnectionState.Disconnected) {
            container.connect();
        }
    });
}

const getCodeProposal =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    (quorum: IQuorumProposals) => quorum.get("code") ?? quorum.get("code2");

/**
 * Helper function to report to telemetry cases where operation takes longer than expected (1s)
 * @param logger - logger to use
 * @param eventName - event name
 * @param action - functor to call and measure
 */
async function ReportIfTooLong(
    logger: ITelemetryLogger,
    eventName: string,
    action: () => Promise<ITelemetryProperties>,
) {
    const event = PerformanceEvent.start(logger, { eventName });
    const props = await action();
    if (event.duration > 1000) {
        event.end(props);
    }
}

/**
 * State saved by a container at close time, to be used to load a new instance
 * of the container to the same state
 */
export interface IPendingContainerState {
    pendingRuntimeState: unknown;
    url: string;
    protocol: IProtocolState;
    term: number;
    clientId?: string;
}

const summarizerClientType = "summarizer";

export class Container extends EventEmitterWithErrorHandling<IContainerEvents> implements IContainer {
    public static version = "^0.1.0";

    /**
     * Load an existing container.
     */
    public static async load(
        loader: Loader,
        loadOptions: IContainerLoadOptions,
        pendingLocalState?: IPendingContainerState,
        protocolHandlerBuilder?: ProtocolHandlerBuilder,
    ): Promise<Container> {
        const container = new Container(
            loader,
            {
                clientDetailsOverride: loadOptions.clientDetailsOverride,
                resolvedUrl: loadOptions.resolvedUrl,
                canReconnect: loadOptions.canReconnect,
                serializedContainerState: pendingLocalState,
            },
            protocolHandlerBuilder);

        return PerformanceEvent.timedExecAsync(
            container.mc.logger,
            { eventName: "Load" },
            async (event) => new Promise<Container>((resolve, reject) => {
                const version = loadOptions.version;

                const defaultMode: IContainerLoadMode = { opsBeforeReturn: "cached" };
                // if we have pendingLocalState, anything we cached is not useful and we shouldn't wait for connection
                // to return container, so ignore this value and use undefined for opsBeforeReturn
                const mode: IContainerLoadMode = pendingLocalState
                    ? { ...(loadOptions.loadMode ?? defaultMode), opsBeforeReturn: undefined }
                    : loadOptions.loadMode ?? defaultMode;

                const onClosed = (err?: ICriticalContainerError) => {
                    // pre-0.58 error message: containerClosedWithoutErrorDuringLoad
                    reject(err ?? new GenericError("Container closed without error during load"));
                };
                container.on("closed", onClosed);

                container.load(version, mode, pendingLocalState)
                    .finally(() => {
                        container.removeListener("closed", onClosed);
                    })
                    .then((props) => {
                        event.end({ ...props, ...loadOptions.loadMode });
                        resolve(container);
                    },
                        (error) => {
                            const err = normalizeError(error);
                            // Depending where error happens, we can be attempting to connect to web socket
                            // and continuously retrying (consider offline mode)
                            // Host has no container to close, so it's prudent to do it here
                            container.close(err);
                            onClosed(err);
                        });
            }),
            { start: true, end: true, cancel: "generic" },
        );
    }

    /**
     * Create a new container in a detached state.
     */
    public static async createDetached(
        loader: Loader,
        codeDetails: IFluidCodeDetails,
        protocolHandlerBuilder?: ProtocolHandlerBuilder,
    ): Promise<Container> {
        const container = new Container(
            loader,
            {},
            protocolHandlerBuilder);

        return PerformanceEvent.timedExecAsync(
            container.mc.logger,
            { eventName: "CreateDetached" },
            async (_event) => {
                await container.createDetached(codeDetails);
                return container;
            },
            { start: true, end: true, cancel: "generic" });
    }

    /**
     * Create a new container in a detached state that is initialized with a
     * snapshot from a previous detached container.
     */
    public static async rehydrateDetachedFromSnapshot(
        loader: Loader,
        snapshot: string,
        protocolHandlerBuilder?: ProtocolHandlerBuilder,
    ): Promise<Container> {
        const container = new Container(
            loader,
            {},
            protocolHandlerBuilder);

        return PerformanceEvent.timedExecAsync(
            container.mc.logger,
            { eventName: "RehydrateDetachedFromSnapshot" },
            async (_event) => {
                const deserializedSummary = JSON.parse(snapshot) as ISummaryTree;
                await container.rehydrateDetachedFromSnapshot(deserializedSummary);
                return container;
            },
            { start: true, end: true, cancel: "generic" });
    }

    public subLogger: TelemetryLogger;

    // Tells if container can reconnect on losing fist connection
    // If false, container gets closed on loss of connection.
    private readonly _canReconnect: boolean = true;

    private readonly mc: MonitoringContext;

    private _lifecycleState: "loading" | "loaded" | "closing" | "closed" = "loading";

    private setLoaded() {
        // It's conceivable the container could be closed when this is called
        // Only transition states if currently loading
        if (this._lifecycleState === "loading") {
            // Propagate current connection state through the system.
            this.propagateConnectionState();
            this._lifecycleState = "loaded";
        }
    }

    public get closed(): boolean {
        return (this._lifecycleState === "closing" || this._lifecycleState === "closed");
    }

    private _attachState = AttachState.Detached;

    private readonly _storage: ContainerStorageAdapter;
    public get storage(): IDocumentStorageService {
        return this._storage;
    }

    private _storageService: IDocumentStorageService & IDisposable | undefined;
    private get storageService(): IDocumentStorageService {
        if (this._storageService === undefined) {
            throw new Error("Attempted to access storageService before it was defined");
        }
        return this._storageService;
    }

    private readonly clientDetailsOverride: IClientDetails | undefined;
    private readonly _deltaManager: DeltaManager<ConnectionManager>;
    private service: IDocumentService | undefined;
    private _initialClients: ISignalClient[] | undefined;

    private _context: ContainerContext | undefined;
    private get context() {
        if (this._context === undefined) {
            throw new GenericError("Attempted to access context before it was defined");
        }
        return this._context;
    }
    private _protocolHandler: IProtocolHandler | undefined;
    private get protocolHandler() {
        if (this._protocolHandler === undefined) {
            throw new Error("Attempted to access protocolHandler before it was defined");
        }
        return this._protocolHandler;
    }

    /** During initialization we pause the inbound queues. We track this state to ensure we only call resume once */
    private inboundQueuePausedFromInit = true;
    private firstConnection = true;
    private readonly connectionTransitionTimes: number[] = [];
    private messageCountAfterDisconnection: number = 0;
    private _loadedFromVersion: IVersion | undefined;
    private _resolvedUrl: IFluidResolvedUrl | undefined;
    private attachStarted = false;
    private _dirtyContainer = false;

    private lastVisible: number | undefined;
    private readonly visibilityEventHandler: (() => void) | undefined;
    private readonly connectionStateHandler: ConnectionStateHandler;

    private setAutoReconnectTime = performance.now();

    private collabWindowTracker: CollabWindowTracker | undefined;

    private get connectionMode() { return this._deltaManager.connectionManager.connectionMode; }

    public get IFluidRouter(): IFluidRouter { return this; }

    public get resolvedUrl(): IResolvedUrl | undefined {
        return this._resolvedUrl;
    }

    public get loadedFromVersion(): IVersion | undefined {
        return this._loadedFromVersion;
    }

    public get readOnlyInfo(): ReadOnlyInfo {
        return this._deltaManager.readOnlyInfo;
    }

    public get closeSignal(): AbortSignal {
        return this._deltaManager.closeAbortController.signal;
    }

    /**
     * Tracks host requiring read-only mode.
     */
    public forceReadonly(readonly: boolean) {
        this._deltaManager.connectionManager.forceReadonly(readonly);
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._deltaManager;
    }

    public get connectionState(): ConnectionState {
        return this.connectionStateHandler.connectionState;
    }

    public get connected(): boolean {
        return this.connectionStateHandler.connected;
    }

    /**
     * Service configuration details. If running in offline mode will be undefined otherwise will contain service
     * configuration details returned as part of the initial connection.
     */
    public get serviceConfiguration(): IClientConfiguration | undefined {
        return this._deltaManager.serviceConfiguration;
    }

    /**
     * The server provided id of the client.
     * Set once this.connected is true, otherwise undefined
     */
    public get clientId(): string | undefined {
        return this.connectionStateHandler.clientId;
    }

    /**
     * The server provided claims of the client.
     * Set once this.connected is true, otherwise undefined
     */
    public get scopes(): string[] | undefined {
        return this._deltaManager.connectionManager.scopes;
    }

    public get clientDetails(): IClientDetails {
        return this._deltaManager.clientDetails;
    }

    /**
     * Get the code details that are currently specified for the container.
     * @returns The current code details if any are specified, undefined if none are specified.
     */
    public getSpecifiedCodeDetails(): IFluidCodeDetails | undefined {
        return this.getCodeDetailsFromQuorum();
    }

    /**
     * Get the code details that were used to load the container.
     * @returns The code details that were used to load the container if it is loaded, undefined if it is not yet
     * loaded.
     */
    public getLoadedCodeDetails(): IFluidCodeDetails | undefined {
        return this._context?.codeDetails;
    }

    /**
     * Retrieves the audience associated with the document
     */
    public get audience(): IAudience {
        return this.protocolHandler.audience;
    }

    /**
     * Returns true if container is dirty.
     * Which means data loss if container is closed at that same moment
     * Most likely that happens when there is no network connection to ordering service
     */
    public get isDirty() {
        return this._dirtyContainer;
    }

    private get serviceFactory() { return this.loader.services.documentServiceFactory; }
    private get urlResolver() { return this.loader.services.urlResolver; }
    public readonly options: ILoaderOptions;
    private get scope() { return this.loader.services.scope; }
    private get codeLoader() { return this.loader.services.codeLoader; }

    constructor(
        private readonly loader: Loader,
        config: IContainerConfig,
        private readonly protocolHandlerBuilder?: ProtocolHandlerBuilder,
    ) {
        super((name, error) => {
            this.mc.logger.sendErrorEvent(
                {
                    eventName: "ContainerEventHandlerException",
                    name: typeof name === "string" ? name : undefined,
                },
                error);
        });

        this.clientDetailsOverride = config.clientDetailsOverride;
        this._resolvedUrl = config.resolvedUrl;
        if (config.canReconnect !== undefined) {
            this._canReconnect = config.canReconnect;
        }

        // Create logger for data stores to use
        const type = this.client.details.type;
        const interactive = this.client.details.capabilities.interactive;
        const clientType =
            `${interactive ? "interactive" : "noninteractive"}${type !== undefined && type !== "" ? `/${type}` : ""}`;
        // Need to use the property getter for docId because for detached flow we don't have the docId initially.
        // We assign the id later so property getter is used.
        this.subLogger = ChildLogger.create(
            loader.services.subLogger,
            undefined,
            {
                all: {
                    clientType, // Differentiating summarizer container from main container
                    containerId: uuid(),
                    docId: () => this._resolvedUrl?.id ?? undefined,
                    containerAttachState: () => this._attachState,
                    containerLifecycleState: () => this._lifecycleState,
                    containerConnectionState: () => ConnectionState[this.connectionState],
                    serializedContainer: config.serializedContainerState !== undefined,
                },
                // we need to be judicious with our logging here to avoid generating too much data
                // all data logged here should be broadly applicable, and not specific to a
                // specific error or class of errors
                error: {
                    // load information to associate errors with the specific load point
                    dmInitialSeqNumber: () => this._deltaManager?.initialSequenceNumber,
                    dmLastProcessedSeqNumber: () => this._deltaManager?.lastSequenceNumber,
                    dmLastKnownSeqNumber: () => this._deltaManager?.lastKnownSeqNumber,
                    containerLoadedFromVersionId: () => this.loadedFromVersion?.id,
                    containerLoadedFromVersionDate: () => this.loadedFromVersion?.date,
                    // message information to associate errors with the specific execution state
                    // dmLastMsqSeqNumber: if present, same as dmLastProcessedSeqNumber
                    dmLastMsqSeqNumber: () => this.deltaManager?.lastMessage?.sequenceNumber,
                    dmLastMsqSeqTimestamp: () => this.deltaManager?.lastMessage?.timestamp,
                    dmLastMsqSeqClientId: () => this.deltaManager?.lastMessage?.clientId,
                    connectionStateDuration:
                        () => performance.now() - this.connectionTransitionTimes[this.connectionState],
                },
            });

        // Prefix all events in this file with container-loader
        this.mc = loggerToMonitoringContext(ChildLogger.create(this.subLogger, "Container"));

        const summarizeProtocolTree =
            this.mc.config.getBoolean("Fluid.Container.summarizeProtocolTree")
            ?? this.loader.services.options.summarizeProtocolTree;

        this.options = {
            ... this.loader.services.options,
            summarizeProtocolTree,
        };

        this.connectionStateHandler = new ConnectionStateHandler(
            {
                quorumClients: () => this._protocolHandler?.quorum,
                logConnectionStateChangeTelemetry: (value, oldState, reason) =>
                    this.logConnectionStateChangeTelemetry(value, oldState, reason),
                shouldClientJoinWrite: () => this._deltaManager.connectionManager.shouldJoinWrite(),
                maxClientLeaveWaitTime: this.loader.services.options.maxClientLeaveWaitTime,
                logConnectionIssue: (eventName: string, details?: ITelemetryProperties) => {
                    // We get here when socket does not receive any ops on "write" connection, including
                    // its own join op. Attempt recovery option.
                    this._deltaManager.logConnectionIssue({
                        eventName,
                        duration: performance.now() - this.connectionTransitionTimes[ConnectionState.CatchingUp],
                        ...(details === undefined ? {} : { details: JSON.stringify(details) }),
                    });
                },
                connectionStateChanged: () => {
                    // Fire events only if container is fully loaded and not closed
                    if (this._lifecycleState === "loaded") {
                        this.propagateConnectionState();
                    }
                },
            },
            this.mc.logger,
            config.serializedContainerState?.clientId,
        );

        this.on(savedContainerEvent, () => {
            this.connectionStateHandler.containerSaved();
        });

        this._deltaManager = this.createDeltaManager();
        this._storage = new ContainerStorageAdapter(
            () => {
                if (this.attachState !== AttachState.Attached) {
                    if (this.loader.services.detachedBlobStorage !== undefined) {
                        return new BlobOnlyStorage(this.loader.services.detachedBlobStorage, this.mc.logger);
                    }
                    this.mc.logger.sendErrorEvent({
                        eventName: "NoRealStorageInDetachedContainer",
                    });
                    throw new Error("Real storage calls not allowed in Unattached container");
                }
                return this.storageService;
            },
        );

        const isDomAvailable = typeof document === "object" &&
            document !== null &&
            typeof document.addEventListener === "function" &&
            document.addEventListener !== null;
        // keep track of last time page was visible for telemetry
        if (isDomAvailable) {
            this.lastVisible = document.hidden ? performance.now() : undefined;
            this.visibilityEventHandler = () => {
                if (document.hidden) {
                    this.lastVisible = performance.now();
                } else {
                    // settimeout so this will hopefully fire after disconnect event if being hidden caused it
                    setTimeout(() => { this.lastVisible = undefined; }, 0);
                }
            };
            document.addEventListener("visibilitychange", this.visibilityEventHandler);
        }

        // We observed that most users of platform do not check Container.connected event on load, causing bugs.
        // As such, we are raising events when new listener pops up.
        // Note that we can raise both "disconnected" & "connect" events at the same time,
        // if we are in connecting stage.
        this.on("newListener", (event: string, listener: (...args: any[]) => void) => {
            // Fire events on the end of JS turn, giving a chance for caller to be in consistent state.
            Promise.resolve().then(() => {
                switch (event) {
                    case dirtyContainerEvent:
                        if (this._dirtyContainer) {
                            listener();
                        }
                        break;
                    case savedContainerEvent:
                        if (!this._dirtyContainer) {
                            listener();
                        }
                        break;
                    case connectedEventName:
                        if (this.connected) {
                            listener(this.clientId);
                        }
                        break;
                    case disconnectedEventName:
                        if (!this.connected) {
                            listener();
                        }
                        break;
                    default:
                }
            }).catch((error) => {
                this.mc.logger.sendErrorEvent({ eventName: "RaiseConnectedEventError" }, error);
            });
        });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorumClients {
        return this.protocolHandler.quorum;
    }

    public close(error?: ICriticalContainerError) {
        // 1. Ensure that close sequence is exactly the same no matter if it's initiated by host or by DeltaManager
        // 2. We need to ensure that we deliver disconnect event to runtime properly. See connectionStateChanged
        //    handler. We only deliver events if container fully loaded. Transitioning from "loading" ->
        //    "closing" will lose that info (can also solve by tracking extra state).
        this._deltaManager.close(error);
        assert(this.connectionState === ConnectionState.Disconnected,
            0x0cf /* "disconnect event was not raised!" */);

        assert(this._lifecycleState === "closed", 0x314 /* Container properly closed */);
    }

    private closeCore(error?: ICriticalContainerError) {
        assert(!this.closed, 0x315 /* re-entrancy */);

        try {
            // Ensure that we raise all key events even if one of these throws
            try {
                // Raise event first, to ensure we capture _lifecycleState before transition.
                // This gives us a chance to know what errors happened on open vs. on fully loaded container.
                this.mc.logger.sendTelemetryEvent(
                    {
                        eventName: "ContainerClose",
                        category: error === undefined ? "generic" : "error",
                    },
                    error,
                );

                this._lifecycleState = "closing";

                this._protocolHandler?.close();

                this.connectionStateHandler.dispose();

                this._context?.dispose(error !== undefined ? new Error(error.message) : undefined);

                this._storageService?.dispose();

                // Notify storage about critical errors. They may be due to disconnect between client & server knowledge
                // about file, like file being overwritten in storage, but client having stale local cache.
                // Driver need to ensure all caches are cleared on critical errors
                this.service?.dispose(error);
            } catch (exception) {
                this.mc.logger.sendErrorEvent({ eventName: "ContainerCloseException" }, exception);
            }

            this.emit("closed", error);

            this.removeAllListeners();
            if (this.visibilityEventHandler !== undefined) {
                document.removeEventListener("visibilitychange", this.visibilityEventHandler);
            }
        } finally {
            this._lifecycleState = "closed";
        }
    }

    public closeAndGetPendingLocalState(): string {
        // runtime matches pending ops to successful ones by clientId and client seq num, so we need to close the
        // container at the same time we get pending state, otherwise this container could reconnect and resubmit with
        // a new clientId and a future container using stale pending state without the new clientId would resubmit them

        assert(this.attachState === AttachState.Attached, 0x0d1 /* "Container should be attached before close" */);
        assert(this.resolvedUrl !== undefined && this.resolvedUrl.type === "fluid",
            0x0d2 /* "resolved url should be valid Fluid url" */);
        assert(!!this._protocolHandler, 0x2e3 /* "Must have a valid protocol handler instance" */);
        assert(this._protocolHandler.attributes.term !== undefined, "Must have a valid protocol handler instance");
        const pendingState: IPendingContainerState = {
            pendingRuntimeState: this.context.getPendingLocalState(),
            url: this.resolvedUrl.url,
            protocol: this.protocolHandler.getProtocolState(),
            term: this._protocolHandler.attributes.term,
            clientId: this.clientId,
        };

        this.close();

        return JSON.stringify(pendingState);
    }

    public get attachState(): AttachState {
        return this._attachState;
    }

    public serialize(): string {
        assert(this.attachState === AttachState.Detached, 0x0d3 /* "Should only be called in detached container" */);

        const appSummary: ISummaryTree = this.context.createSummary();
        const protocolSummary = this.captureProtocolSummary();
        const combinedSummary = combineAppAndProtocolSummary(appSummary, protocolSummary);

        if (this.loader.services.detachedBlobStorage && this.loader.services.detachedBlobStorage.size > 0) {
            combinedSummary.tree[".hasAttachmentBlobs"] = { type: SummaryType.Blob, content: "true" };
        }
        return JSON.stringify(combinedSummary);
    }

    public async attach(request: IRequest): Promise<void> {
        await PerformanceEvent.timedExecAsync(this.mc.logger, { eventName: "Attach" }, async () => {
            if (this._lifecycleState !== "loaded") {
                // pre-0.58 error message: containerNotValidForAttach
                throw new UsageError(`The Container is not in a valid state for attach [${this._lifecycleState}]`);
            }

            // If container is already attached or attach is in progress, throw an error.
            assert(this._attachState === AttachState.Detached && !this.attachStarted,
                0x205 /* "attach() called more than once" */);
            this.attachStarted = true;

            // If attachment blobs were uploaded in detached state we will go through a different attach flow
            const hasAttachmentBlobs = this.loader.services.detachedBlobStorage !== undefined
                && this.loader.services.detachedBlobStorage.size > 0;

            try {
                assert(this.deltaManager.inbound.length === 0,
                    0x0d6 /* "Inbound queue should be empty when attaching" */);

                let summary: ISummaryTree;
                if (!hasAttachmentBlobs) {
                    // Get the document state post attach - possibly can just call attach but we need to change the
                    // semantics around what the attach means as far as async code goes.
                    const appSummary: ISummaryTree = this.context.createSummary();
                    const protocolSummary = this.captureProtocolSummary();
                    summary = combineAppAndProtocolSummary(appSummary, protocolSummary);

                    // Set the state as attaching as we are starting the process of attaching container.
                    // This should be fired after taking the summary because it is the place where we are
                    // starting to attach the container to storage.
                    // Also, this should only be fired in detached container.
                    this._attachState = AttachState.Attaching;
                    this.context.notifyAttaching(getSnapshotTreeFromSerializedContainer(summary));
                }

                // Actually go and create the resolved document
                const createNewResolvedUrl = await this.urlResolver.resolve(request);
                ensureFluidResolvedUrl(createNewResolvedUrl);
                if (this.service === undefined) {
                    assert(this.client.details.type !== summarizerClientType,
                        0x2c4 /* "client should not be summarizer before container is created" */);
                    this.service = await runWithRetry(
                        async () => this.serviceFactory.createContainer(
                            summary,
                            createNewResolvedUrl,
                            this.subLogger,
                            false, // clientIsSummarizer
                        ),
                        "containerAttach",
                        this.mc.logger,
                        {
                            cancel: this.closeSignal,
                        }, // progress
                    );
                }
                const resolvedUrl = this.service.resolvedUrl;
                ensureFluidResolvedUrl(resolvedUrl);
                this._resolvedUrl = resolvedUrl;
                await this.connectStorageService();

                if (hasAttachmentBlobs) {
                    // upload blobs to storage
                    assert(!!this.loader.services.detachedBlobStorage, 0x24e /* "assertion for type narrowing" */);

                    // build a table mapping IDs assigned locally to IDs assigned by storage and pass it to runtime to
                    // support blob handles that only know about the local IDs
                    const redirectTable = new Map<string, string>();
                    // if new blobs are added while uploading, upload them too
                    while (redirectTable.size < this.loader.services.detachedBlobStorage.size) {
                        const newIds = this.loader.services.detachedBlobStorage.getBlobIds().filter(
                            (id) => !redirectTable.has(id));
                        for (const id of newIds) {
                            const blob = await this.loader.services.detachedBlobStorage.readBlob(id);
                            const response = await this.storageService.createBlob(blob);
                            redirectTable.set(id, response.id);
                        }
                    }

                    // take summary and upload
                    const appSummary: ISummaryTree = this.context.createSummary(redirectTable);
                    const protocolSummary = this.captureProtocolSummary();
                    summary = combineAppAndProtocolSummary(appSummary, protocolSummary);

                    this._attachState = AttachState.Attaching;
                    this.context.notifyAttaching(getSnapshotTreeFromSerializedContainer(summary));

                    await this.storageService.uploadSummaryWithContext(summary, {
                        referenceSequenceNumber: 0,
                        ackHandle: undefined,
                        proposalHandle: undefined,
                    });
                }

                this._attachState = AttachState.Attached;
                this.emit("attached");

                // Propagate current connection state through the system.
                this.propagateConnectionState();
                if (!this.closed) {
                    this.resumeInternal({ fetchOpsFromStorage: false, reason: "createDetached" });
                }
            } catch (error) {
                // add resolved URL on error object so that host has the ability to find this document and delete it
                const newError = normalizeError(error);
                const resolvedUrl = this.resolvedUrl;
                if (isFluidResolvedUrl(resolvedUrl)) {
                    newError.addTelemetryProperties({ resolvedUrl: resolvedUrl.url });
                }
                this.close(newError);
                throw newError;
            }
        },
            { start: true, end: true, cancel: "generic" });
    }

    public async request(path: IRequest): Promise<IResponse> {
        return PerformanceEvent.timedExecAsync(
            this.mc.logger,
            { eventName: "Request" },
            async () => this.context.request(path),
            { end: true, cancel: "error" },
        );
    }

    private setAutoReconnectInternal(mode: ReconnectMode) {
        const currentMode = this._deltaManager.connectionManager.reconnectMode;

        if (currentMode === mode) {
            return;
        }

        const now = performance.now();
        const duration = now - this.setAutoReconnectTime;
        this.setAutoReconnectTime = now;

        this.mc.logger.sendTelemetryEvent({
            eventName: mode === ReconnectMode.Enabled ? "AutoReconnectEnabled" : "AutoReconnectDisabled",
            connectionMode: this.connectionMode,
            connectionState: ConnectionState[this.connectionState],
            duration,
        });

        this._deltaManager.connectionManager.setAutoReconnect(mode);
    }

    public connect() {
        if (this.closed) {
            throw new UsageError(`The Container is closed and cannot be connected`);
        } else if (this._attachState !== AttachState.Attached) {
            throw new UsageError(`The Container is not attached and cannot be connected`);
        } else if (!this.connected) {
            // Note: no need to fetch ops as we do it preemptively as part of DeltaManager.attachOpHandler().
            // If there is gap, we will learn about it once connected, but the gap should be small (if any),
            // assuming that connect() is called quickly after initial container boot.
            this.connectInternal({ reason: "DocumentConnect", fetchOpsFromStorage: false });
        }
    }

    private connectInternal(args: IConnectionArgs) {
        assert(!this.closed, 0x2c5 /* "Attempting to connect() a closed Container" */);
        assert(this._attachState === AttachState.Attached,
            0x2c6 /* "Attempting to connect() a container that is not attached" */);

        // Resume processing ops and connect to delta stream
        this.resumeInternal(args);

        // Set Auto Reconnect Mode
        const mode = ReconnectMode.Enabled;
        this.setAutoReconnectInternal(mode);
    }

    public disconnect() {
        if (this.closed) {
            throw new UsageError(`The Container is closed and cannot be disconnected`);
        } else {
            this.disconnectInternal();
        }
    }

    private disconnectInternal() {
        assert(!this.closed, 0x2c7 /* "Attempting to disconnect() a closed Container" */);

        // Set Auto Reconnect Mode
        const mode = ReconnectMode.Disabled;
        this.setAutoReconnectInternal(mode);
    }

    private resumeInternal(args: IConnectionArgs) {
        assert(!this.closed, 0x0d9 /* "Attempting to connect() a closed DeltaManager" */);

        // Resume processing ops
        if (this.inboundQueuePausedFromInit) {
            this.inboundQueuePausedFromInit = false;
            this._deltaManager.inbound.resume();
            this._deltaManager.inboundSignal.resume();
        }

        // Ensure connection to web socket
        this.connectToDeltaStream(args);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.resolvedUrl === undefined) {
            return undefined;
        }

        return this.urlResolver.getAbsoluteUrl(
            this.resolvedUrl,
            relativeUrl,
            getPackageName(this._context?.codeDetails));
    }

    public async proposeCodeDetails(codeDetails: IFluidCodeDetails) {
        if (!isFluidCodeDetails(codeDetails)) {
            throw new Error("Provided codeDetails are not IFluidCodeDetails");
        }

        if (this.codeLoader.IFluidCodeDetailsComparer) {
            const comparison = await this.codeLoader.IFluidCodeDetailsComparer.compare(
                codeDetails,
                this.getCodeDetailsFromQuorum());
            if (comparison !== undefined && comparison <= 0) {
                throw new Error("Proposed code details should be greater than the current");
            }
        }

        return this.protocolHandler.quorum.propose("code", codeDetails)
            .then(() => true)
            .catch(() => false);
    }

    private async processCodeProposal(): Promise<void> {
        const codeDetails = this.getCodeDetailsFromQuorum();

        await Promise.all([
            this.deltaManager.inbound.pause(),
            this.deltaManager.inboundSignal.pause()]);

        if ((await this.context.satisfies(codeDetails) === true)) {
            this.deltaManager.inbound.resume();
            this.deltaManager.inboundSignal.resume();
            return;
        }

        // pre-0.58 error message: existingContextDoesNotSatisfyIncomingProposal
        this.close(new GenericError("Existing context does not satisfy incoming proposal"));
    }

    private async getVersion(version: string | null): Promise<IVersion | undefined> {
        const versions = await this.storageService.getVersions(version, 1);
        return versions[0];
    }

    private recordConnectStartTime() {
        if (this.connectionTransitionTimes[ConnectionState.Disconnected] === undefined) {
            this.connectionTransitionTimes[ConnectionState.Disconnected] = performance.now();
        }
    }

    private connectToDeltaStream(args: IConnectionArgs) {
        this.recordConnectStartTime();

        // All agents need "write" access, including summarizer.
        if (!this._canReconnect || !this.client.details.capabilities.interactive) {
            args.mode = "write";
        }

        this._deltaManager.connect(args);
    }

    /**
     * Load container.
     *
     * @param specifiedVersion - one of the following
     *   - undefined - fetch latest snapshot
     *   - otherwise, version sha to load snapshot
     */
    private async load(
        specifiedVersion: string | undefined,
        loadMode: IContainerLoadMode,
        pendingLocalState?: IPendingContainerState,
    ) {
        if (this._resolvedUrl === undefined) {
            throw new Error("Attempting to load without a resolved url");
        }
        this.service = await this.serviceFactory.createDocumentService(
            this._resolvedUrl,
            this.subLogger,
            this.client.details.type === summarizerClientType,
        );

        // Ideally we always connect as "read" by default.
        // Currently that works with SPO & r11s, because we get "write" connection when connecting to non-existing file.
        // We should not rely on it by (one of them will address the issue, but we need to address both)
        // 1) switching create new flow to one where we create file by posting snapshot
        // 2) Fixing quorum workflows (have retry logic)
        // That all said, "read" does not work with memorylicious workflows (that opens two simultaneous
        // connections to same file) in two ways:
        // A) creation flow breaks (as one of the clients "sees" file as existing, and hits #2 above)
        // B) Once file is created, transition from view-only connection to write does not work - some bugs to be fixed.
        const connectionArgs: IConnectionArgs = { reason: "DocumentOpen", mode: "write", fetchOpsFromStorage: false };

        // Start websocket connection as soon as possible. Note that there is no op handler attached yet, but the
        // DeltaManager is resilient to this and will wait to start processing ops until after it is attached.
        if (loadMode.deltaConnection === undefined) {
            this.connectToDeltaStream(connectionArgs);
        }

        if (!pendingLocalState) {
            await this.connectStorageService();
        } else {
            // if we have pendingLocalState we can load without storage; don't wait for connection
            this.connectStorageService().catch((error) => this.close(error));
        }

        this._attachState = AttachState.Attached;

        // Fetch specified snapshot.
        const { snapshot, versionId } = pendingLocalState === undefined
            ? await this.fetchSnapshotTree(specifiedVersion)
            : { snapshot: undefined, versionId: undefined };
        assert(snapshot !== undefined || pendingLocalState !== undefined, 0x237 /* "Snapshot should exist" */);

        const attributes: IDocumentAttributes = pendingLocalState === undefined
            ? await this.getDocumentAttributes(this.storageService, snapshot)
            : {
                sequenceNumber: pendingLocalState.protocol.sequenceNumber,
                minimumSequenceNumber: pendingLocalState.protocol.minimumSequenceNumber,
                term: pendingLocalState.term,
            };

        let opsBeforeReturnP: Promise<void> | undefined;

        // Attach op handlers to finish initialization and be able to start processing ops
        // Kick off any ops fetching if required.
        switch (loadMode.opsBeforeReturn) {
            case undefined:
                // Start prefetch, but not set opsBeforeReturnP - boot is not blocked by it!
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.attachDeltaManagerOpHandler(attributes, loadMode.deltaConnection !== "none" ? "all" : "none");
                break;
            case "cached":
                opsBeforeReturnP = this.attachDeltaManagerOpHandler(attributes, "cached");
                break;
            case "all":
                opsBeforeReturnP = this.attachDeltaManagerOpHandler(attributes, "all");
                break;
            default:
                unreachableCase(loadMode.opsBeforeReturn);
        }

        // ...load in the existing quorum
        // Initialize the protocol handler
        this._protocolHandler = pendingLocalState === undefined
            ? await this.initializeProtocolStateFromSnapshot(
                attributes,
                this.storageService,
                snapshot,
            ) : await this.initializeProtocolState(
                attributes,
                {
                    members: pendingLocalState.protocol.members,
                    proposals: pendingLocalState.protocol.proposals,
                    values: pendingLocalState.protocol.values,
                }, // pending IQuorumSnapshot
            );

        const codeDetails = this.getCodeDetailsFromQuorum();
        await this.instantiateContext(
            true, // existing
            codeDetails,
            snapshot,
            pendingLocalState?.pendingRuntimeState,
        );

        // We might have hit some failure that did not manifest itself in exception in this flow,
        // do not start op processing in such case - static version of Container.load() will handle it correctly.
        if (!this.closed) {
            if (opsBeforeReturnP !== undefined) {
                this._deltaManager.inbound.resume();

                await ReportIfTooLong(
                    this.mc.logger,
                    "WaitOps",
                    async () => { await opsBeforeReturnP; return {}; });
                await ReportIfTooLong(
                    this.mc.logger,
                    "WaitOpProcessing",
                    async () => this._deltaManager.inbound.waitTillProcessingDone());

                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this._deltaManager.inbound.pause();
            }

            switch (loadMode.deltaConnection) {
                case undefined:
                case "delayed":
                    assert(this.inboundQueuePausedFromInit, 0x346 /* inboundQueuePausedFromInit should be true */);
                    this.inboundQueuePausedFromInit = false;
                    this._deltaManager.inbound.resume();
                    this._deltaManager.inboundSignal.resume();
                    break;
                case "none":
                    break;
                default:
                    unreachableCase(loadMode.deltaConnection);
            }
        }

        // Safety net: static version of Container.load() should have learned about it through "closed" handler.
        // But if that did not happen for some reason, fail load for sure.
        // Otherwise we can get into situations where container is closed and does not try to connect to ordering
        // service, but caller does not know that (callers do expect container to be not closed on successful path
        // and listen only on "closed" event)
        if (this.closed) {
            throw new Error("Container was closed while load()");
        }

        // Internal context is fully loaded at this point
        this.setLoaded();

        return {
            sequenceNumber: attributes.sequenceNumber,
            version: versionId,
            dmLastProcessedSeqNumber: this._deltaManager.lastSequenceNumber,
            dmLastKnownSeqNumber: this._deltaManager.lastKnownSeqNumber,
        };
    }

    private async createDetached(source: IFluidCodeDetails) {
        const attributes: IDocumentAttributes = {
            sequenceNumber: detachedContainerRefSeqNumber,
            term: 1,
            minimumSequenceNumber: 0,
        };

        await this.attachDeltaManagerOpHandler(attributes);

        // Need to just seed the source data in the code quorum. Quorum itself is empty
        const qValues = initQuorumValuesFromCodeDetails(source);
        this._protocolHandler = await this.initializeProtocolState(
            attributes,
            {
                members: [],
                proposals: [],
                values: qValues,
            }, // IQuorumSnapShot
        );

        // The load context - given we seeded the quorum - will be great
        await this.instantiateContextDetached(
            false, // existing
        );

        this.setLoaded();
    }

    private async rehydrateDetachedFromSnapshot(detachedContainerSnapshot: ISummaryTree) {
        if (detachedContainerSnapshot.tree[".hasAttachmentBlobs"] !== undefined) {
            assert(!!this.loader.services.detachedBlobStorage && this.loader.services.detachedBlobStorage.size > 0,
                0x250 /* "serialized container with attachment blobs must be rehydrated with detached blob storage" */);
            delete detachedContainerSnapshot.tree[".hasAttachmentBlobs"];
        }

        const snapshotTree = getSnapshotTreeFromSerializedContainer(detachedContainerSnapshot);
        this._storage.loadSnapshotForRehydratingContainer(snapshotTree);
        const attributes = await this.getDocumentAttributes(this._storage, snapshotTree);

        await this.attachDeltaManagerOpHandler(attributes);

        // Initialize the protocol handler
        const baseTree = getProtocolSnapshotTree(snapshotTree);
        const qValues = await readAndParse<[string, ICommittedProposal][]>(
            this._storage,
            baseTree.blobs.quorumValues,
        );
        const codeDetails = getCodeDetailsFromQuorumValues(qValues);
        this._protocolHandler =
            await this.initializeProtocolState(
                attributes,
                {
                    members: [],
                    proposals: [],
                    values: codeDetails !== undefined ? initQuorumValuesFromCodeDetails(codeDetails) : [],
                }, // IQuorumSnapShot
            );

        await this.instantiateContextDetached(
            true, // existing
            snapshotTree,
        );

        this.setLoaded();
    }

    private async connectStorageService(): Promise<void> {
        if (this._storageService !== undefined) {
            return;
        }

        assert(this.service !== undefined, 0x1ef /* "services must be defined" */);
        const storageService = await this.service.connectToStorage();

        this._storageService =
            new RetriableDocumentStorageService(storageService, this.mc.logger);

        if (this.options.summarizeProtocolTree === true) {
            this.mc.logger.sendTelemetryEvent({ eventName: "summarizeProtocolTreeEnabled" });
            this._storageService =
                new ProtocolTreeStorageService(this._storageService, () => this.captureProtocolSummary());
        }

        // ensure we did not lose that policy in the process of wrapping
        assert(storageService.policies?.minBlobSize === this.storageService.policies?.minBlobSize,
            0x0e0 /* "lost minBlobSize policy" */);
    }

    private async getDocumentAttributes(
        storage: IDocumentStorageService,
        tree: ISnapshotTree | undefined,
    ): Promise<IDocumentAttributes> {
        if (tree === undefined) {
            return {
                minimumSequenceNumber: 0,
                sequenceNumber: 0,
                term: 1,
            };
        }

        // Backward compatibility: old docs would have ".attributes" instead of "attributes"
        const attributesHash = ".protocol" in tree.trees
            ? tree.trees[".protocol"].blobs.attributes
            : tree.blobs[".attributes"];

        const attributes = await readAndParse<IDocumentAttributes>(storage, attributesHash);

        // Backward compatibility for older summaries with no term
        if (attributes.term === undefined) {
            attributes.term = 1;
        }

        return attributes;
    }

    private async initializeProtocolStateFromSnapshot(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        snapshot: ISnapshotTree | undefined,
    ): Promise<IProtocolHandler> {
        const quorumSnapshot: IQuorumSnapshot = {
            members: [],
            proposals: [],
            values: [],
        };

        if (snapshot !== undefined) {
            const baseTree = getProtocolSnapshotTree(snapshot);
            [quorumSnapshot.members, quorumSnapshot.proposals, quorumSnapshot.values] = await Promise.all([
                readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers),
                readAndParse<[number, ISequencedProposal, string[]][]>(storage, baseTree.blobs.quorumProposals),
                readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues),
            ]);
        }

        const protocolHandler = await this.initializeProtocolState(attributes, quorumSnapshot);
        return protocolHandler;
    }

    private async initializeProtocolState(
        attributes: IDocumentAttributes,
        quorumSnapshot: IQuorumSnapshot,
    ): Promise<IProtocolHandler> {
        const protocolHandlerBuilder =
            this.protocolHandlerBuilder ?? ((...args) => new ProtocolHandler(...args, new Audience()));
        const protocol = protocolHandlerBuilder(
            attributes,
            quorumSnapshot,
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            this._initialClients ?? [],
        );

        this._initialClients = undefined;

        const protocolLogger = ChildLogger.create(this.subLogger, "ProtocolHandler");

        protocol.quorum.on("error", (error) => {
            protocolLogger.sendErrorEvent(error);
        });

        // Track membership changes and update connection state accordingly
        this.connectionStateHandler.initProtocol(protocol);

        protocol.quorum.on("addProposal", (proposal: ISequencedProposal) => {
            if (proposal.key === "code" || proposal.key === "code2") {
                this.emit("codeDetailsProposed", proposal.value, proposal);
            }
        });

        protocol.quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                if (key === "code" || key === "code2") {
                    if (!isFluidCodeDetails(value)) {
                        this.mc.logger.sendErrorEvent({
                            eventName: "CodeProposalNotIFluidCodeDetails",
                        });
                    }
                    this.processCodeProposal().catch((error) => {
                        this.close(normalizeError(error));
                        throw error;
                    });
                }
            });

        return protocol;
    }

    private captureProtocolSummary(): ISummaryTree {
        const quorumSnapshot = this.protocolHandler.snapshot();
        const summary: ISummaryTree = {
            tree: {
                attributes: {
                    content: JSON.stringify(this.protocolHandler.attributes),
                    type: SummaryType.Blob,
                },
                quorumMembers: {
                    content: JSON.stringify(quorumSnapshot.members),
                    type: SummaryType.Blob,
                },
                quorumProposals: {
                    content: JSON.stringify(quorumSnapshot.proposals),
                    type: SummaryType.Blob,
                },
                quorumValues: {
                    content: JSON.stringify(quorumSnapshot.values),
                    type: SummaryType.Blob,
                },
            },
            type: SummaryType.Tree,
        };

        return summary;
    }

    private getCodeDetailsFromQuorum(): IFluidCodeDetails {
        const quorum = this.protocolHandler.quorum;

        const pkg = getCodeProposal(quorum);

        return pkg as IFluidCodeDetails;
    }

    private get client(): IClient {
        const client: IClient = this.options?.client !== undefined
            ? (this.options.client as IClient)
            : {
                details: {
                    capabilities: { interactive: true },
                },
                mode: "read", // default reconnection mode on lost connection / connection error
                permission: [],
                scopes: [],
                user: { id: "" },
            };

        if (this.clientDetailsOverride !== undefined) {
            merge(client.details, this.clientDetailsOverride);
        }
        client.details.environment = [client.details.environment, ` loaderVersion:${pkgVersion}`].join(";");
        return client;
    }

    /**
     * Returns true if connection is active, i.e. it's "write" connection and
     * container runtime was notified about this connection (i.e. we are up-to-date and could send ops).
     * This happens after client received its own joinOp and thus is in the quorum.
     * If it's not true, runtime is not in position to send ops.
     */
    private activeConnection() {
        return this.connectionState === ConnectionState.Connected &&
            this.connectionMode === "write";
    }

    private createDeltaManager() {
        const serviceProvider = () => this.service;
        const deltaManager = new DeltaManager<ConnectionManager>(
            serviceProvider,
            ChildLogger.create(this.subLogger, "DeltaManager"),
            () => this.activeConnection(),
            (props: IConnectionManagerFactoryArgs) => new ConnectionManager(
                serviceProvider,
                this.client,
                this._canReconnect,
                ChildLogger.create(this.subLogger, "ConnectionManager"),
                props),
        );

        // Disable inbound queues as Container is not ready to accept any ops until we are fully loaded!
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        deltaManager.inbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        deltaManager.inboundSignal.pause();

        deltaManager.on("connect", (details: IConnectionDetails, _opsBehind?: number) => {
            if (this._protocolHandler === undefined) {
                // Store the initial clients so that they can be submitted to the
                // protocol handler when it is created.
                this._initialClients = details.initialClients;
            } else {
                // When reconnecting, the protocol handler is already created,
                // so we can update the audience right now.
                this._protocolHandler.audience.clear();

                for (const priorClient of details.initialClients ?? []) {
                    this._protocolHandler.audience.addMember(priorClient.clientId, priorClient.client);
                }
            }

            this.connectionStateHandler.receivedConnectEvent(
                this.connectionMode,
                details,
            );
        });

        deltaManager.on("disconnect", (reason: string) => {
            this.collabWindowTracker?.stopSequenceNumberUpdate();
            this.connectionStateHandler.receivedDisconnectEvent(reason);
        });

        deltaManager.on("throttled", (warning: IThrottlingWarning) => {
            const warn = warning as ContainerWarning;
            // Some "warning" events come from outside the container and are logged
            // elsewhere (e.g. summarizing container). We shouldn't log these here.
            if (warn.logged !== true) {
                this.logContainerError(warn);
            }
            this.emit("warning", warn);
        });

        deltaManager.on("readonly", (readonly) => {
            this.emit("readonly", readonly);
        });

        deltaManager.on("closed", (error?: ICriticalContainerError) => {
            this.closeCore(error);
        });

        return deltaManager;
    }

    private async attachDeltaManagerOpHandler(
        attributes: IDocumentAttributes,
        prefetchType?: "cached" | "all" | "none") {
        return this._deltaManager.attachOpHandler(
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            attributes.term ?? 1,
            {
                process: (message) => this.processRemoteMessage(message),
                processSignal: (message) => {
                    this.processSignal(message);
                },
            },
            prefetchType);
    }

    private logConnectionStateChangeTelemetry(
        value: ConnectionState,
        oldState: ConnectionState,
        reason?: string,
    ) {
        // Log actual event
        const time = performance.now();
        this.connectionTransitionTimes[value] = time;
        const duration = time - this.connectionTransitionTimes[oldState];

        let durationFromDisconnected: number | undefined;
        let connectionInitiationReason: string | undefined;
        let autoReconnect: ReconnectMode | undefined;
        let checkpointSequenceNumber: number | undefined;
        let opsBehind: number | undefined;
        if (value === ConnectionState.Disconnected) {
            autoReconnect = this._deltaManager.connectionManager.reconnectMode;
        } else {
            if (value === ConnectionState.Connected) {
                durationFromDisconnected = time - this.connectionTransitionTimes[ConnectionState.Disconnected];
                durationFromDisconnected = TelemetryLogger.formatTick(durationFromDisconnected);
            } else {
                // This info is of most interest on establishing connection only.
                checkpointSequenceNumber = this.deltaManager.lastKnownSeqNumber;
                if (this.deltaManager.hasCheckpointSequenceNumber) {
                    opsBehind = checkpointSequenceNumber - this.deltaManager.lastSequenceNumber;
                }
            }
            if (this.firstConnection) {
                connectionInitiationReason = "InitialConnect";
            } else {
                connectionInitiationReason = "AutoReconnect";
            }
        }

        this.mc.logger.sendPerformanceEvent({
            eventName: `ConnectionStateChange_${ConnectionState[value]}`,
            from: ConnectionState[oldState],
            duration,
            durationFromDisconnected,
            reason,
            connectionInitiationReason,
            pendingClientId: this.connectionStateHandler.pendingClientId,
            clientId: this.clientId,
            autoReconnect,
            opsBehind,
            online: OnlineStatus[isOnline()],
            lastVisible: this.lastVisible !== undefined ? performance.now() - this.lastVisible : undefined,
            checkpointSequenceNumber,
            quorumSize: this._protocolHandler?.quorum.getMembers().size,
            ...this._deltaManager.connectionProps,
        });

        if (value === ConnectionState.Connected) {
            this.firstConnection = false;
        }
    }

    private propagateConnectionState() {
        const logOpsOnReconnect: boolean =
            this.connectionState === ConnectionState.Connected &&
            !this.firstConnection &&
            this.connectionMode === "write";
        if (logOpsOnReconnect) {
            this.messageCountAfterDisconnection = 0;
        }

        const state = this.connectionState === ConnectionState.Connected;

        // Both protocol and context should not be undefined if we got so far.

        if (this._context?.disposed === false) {
            this.context.setConnectionState(state, this.clientId);
        }
        this.protocolHandler.setConnectionState(state, this.clientId);
        raiseConnectedEvent(this.mc.logger, this, state, this.clientId);

        if (logOpsOnReconnect) {
            this.mc.logger.sendTelemetryEvent(
                { eventName: "OpsSentOnReconnect", count: this.messageCountAfterDisconnection });
        }
    }

    private submitContainerMessage(type: MessageType, contents: any, batch?: boolean, metadata?: any): number {
        const outboundMessageType: string = type;
        switch (outboundMessageType) {
            case MessageType.Operation:
            case MessageType.RemoteHelp:
                break;
            case MessageType.Summarize: {
                // github #6451: this is only needed for staging so the server
                // know when the protocol tree is included
                // this can be removed once all clients send
                // protocol tree by default
                const summary = contents as ISummaryContent;
                if (summary.details === undefined) {
                    summary.details = {};
                }
                summary.details.includesProtocolTree =
                    this.options.summarizeProtocolTree === true;
                break;
            }
            default:
                this.close(new GenericError("invalidContainerSubmitOpType",
                    undefined /* error */,
                    { messageType: type }));
                return -1;
        }
        return this.submitMessage(type, contents, batch, metadata);
    }

    private submitMessage(type: MessageType, contents: any, batch?: boolean, metadata?: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            this.mc.logger.sendErrorEvent({ eventName: "SubmitMessageWithNoConnection", type });
            return -1;
        }

        this.messageCountAfterDisconnection += 1;
        this.collabWindowTracker?.stopSequenceNumberUpdate();
        return this._deltaManager.submit(type, contents, batch, metadata);
    }

    private processRemoteMessage(message: ISequencedDocumentMessage): IProcessMessageResult {
        const local = this.clientId === message.clientId;

        // Allow the protocol handler to process the message
        let result: IProcessMessageResult = { immediateNoOp: false };
        try {
            result = this.protocolHandler.processMessage(message, local);
        } catch (error) {
            this.close(wrapError(error, (errorMessage) =>
                new DataCorruptionError(errorMessage, extractSafePropertiesFromMessage(message))));
        }

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (isUnpackedRuntimeMessage(message) && !isRuntimeMessage(message)) {
            this.mc.logger.sendTelemetryEvent(
                { eventName: "UnpackedRuntimeMessage", type: message.type });
        }
        // Forward non system messages to the loaded runtime for processing
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (isRuntimeMessage(message) || isUnpackedRuntimeMessage(message)) {
            this.context.process(message, local, undefined);
        }

        // Inactive (not in quorum or not writers) clients don't take part in the minimum sequence number calculation.
        if (this.activeConnection()) {
            if (this.collabWindowTracker === undefined) {
                // Note that config from first connection will be used for this container's lifetime.
                // That means that if relay service changes settings, such changes will impact only newly booted
                // clients.
                // All existing will continue to use settings they got earlier.
                assert(
                    this.serviceConfiguration !== undefined,
                    0x2e4 /* "there should be service config for active connection" */);
                this.collabWindowTracker = new CollabWindowTracker(
                    (type, contents) => {
                        assert(this.activeConnection(),
                            0x241 /* "disconnect should result in stopSequenceNumberUpdate() call" */);
                        this.submitMessage(type, contents);
                    },
                    this.serviceConfiguration.noopTimeFrequency,
                    this.serviceConfiguration.noopCountFrequency,
                );
            }
            this.collabWindowTracker.scheduleSequenceNumberUpdate(message, result.immediateNoOp === true);
        }

        this.emit("op", message);

        return result;
    }

    private submitSignal(message: any) {
        this._deltaManager.submitSignal(JSON.stringify(message));
    }

    private processSignal(message: ISignalMessage) {
        // No clientId indicates a system signal message.
        if (message.clientId === null) {
            this.protocolHandler.processSignal(message);
        } else {
            const local = this.clientId === message.clientId;
            this.context.processSignal(message, local);
        }
    }

    /**
     * Get the most recent snapshot, or a specific version.
     * @param specifiedVersion - The specific version of the snapshot to retrieve
     * @returns The snapshot requested, or the latest snapshot if no version was specified, plus version ID
     */
    private async fetchSnapshotTree(specifiedVersion: string | undefined):
        Promise<{ snapshot?: ISnapshotTree; versionId?: string; }> {
        const version = await this.getVersion(specifiedVersion ?? null);

        if (version === undefined && specifiedVersion !== undefined) {
            // We should have a defined version to load from if specified version requested
            this.mc.logger.sendErrorEvent({ eventName: "NoVersionFoundWhenSpecified", id: specifiedVersion });
        }
        this._loadedFromVersion = version;
        const snapshot = await this.storageService.getSnapshotTree(version) ?? undefined;

        if (snapshot === undefined && version !== undefined) {
            this.mc.logger.sendErrorEvent({ eventName: "getSnapshotTreeFailed", id: version.id });
        }
        return { snapshot, versionId: version?.id };
    }

    private async instantiateContextDetached(
        existing: boolean,
        snapshot?: ISnapshotTree,
    ) {
        const codeDetails = this.getCodeDetailsFromQuorum();
        if (codeDetails === undefined) {
            throw new Error("pkg should be provided in create flow!!");
        }

        await this.instantiateContext(
            existing,
            codeDetails,
            snapshot,
        );
    }

    private async instantiateContext(
        existing: boolean,
        codeDetails: IFluidCodeDetails,
        snapshot?: ISnapshotTree,
        pendingLocalState?: unknown,
    ) {
        assert(this._context?.disposed !== false, 0x0dd /* "Existing context not disposed" */);

        // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
        // are set. Global requests will still go directly to the loader
        const loader = new RelativeLoader(this, this.loader);
        this._context = await ContainerContext.createOrLoad(
            this,
            this.scope,
            this.codeLoader,
            codeDetails,
            snapshot,
            new DeltaManagerProxy(this._deltaManager),
            new QuorumProxy(this.protocolHandler.quorum),
            loader,
            (type, contents, batch, metadata) => this.submitContainerMessage(type, contents, batch, metadata),
            (message) => this.submitSignal(message),
            (error?: ICriticalContainerError) => this.close(error),
            Container.version,
            (dirty: boolean) => this.updateDirtyContainerState(dirty),
            existing,
            pendingLocalState,
        );

        this.emit("contextChanged", codeDetails);
    }

    private updateDirtyContainerState(dirty: boolean) {
        if (this._dirtyContainer === dirty) {
            return;
        }
        this._dirtyContainer = dirty;
        this.emit(dirty ? dirtyContainerEvent : savedContainerEvent);
    }

    private logContainerError(warning: ContainerWarning) {
        this.mc.logger.sendErrorEvent({ eventName: "ContainerWarning" }, warning);
    }
}
