/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import merge from "lodash/merge";
import { v4 as uuid } from "uuid";
import {
    IDisposable,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { assert, performance, unreachableCase } from "@fluidframework/common-utils";
import {
    IRequest,
    IResponse,
    IFluidRouter,
    IFluidCodeDetails,
    isFluidCodeDetails,
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
    IPendingLocalState,
    ReadOnlyInfo,
    IContainerLoadMode,
} from "@fluidframework/container-definitions";
import {
    CreateContainerError,
    DataCorruptionError,
    extractSafePropertiesFromMessage,
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
    readAndParseFromBlobs,
    canRetryOnError,
    runWithRetry,
} from "@fluidframework/driver-utils";
import {
    isSystemMessage,
    ProtocolOpHandler,
    QuorumProxy,
} from "@fluidframework/protocol-base";
import {
    FileMode,
    IClient,
    IClientConfiguration,
    IClientDetails,
    ICommittedProposal,
    IDocumentAttributes,
    IDocumentMessage,
    IProcessMessageResult,
    IQuorum,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    IVersion,
    MessageType,
    TreeEntry,
    ISummaryTree,
    IPendingProposal,
    SummaryType,
    ISummaryContent,
} from "@fluidframework/protocol-definitions";
import {
    ChildLogger,
    EventEmitterWithErrorHandling,
    PerformanceEvent,
    raiseConnectedEvent,
    TelemetryLogger,
    connectedEventName,
    disconnectedEventName,
} from "@fluidframework/telemetry-utils";
import { Audience } from "./audience";
import { ContainerContext } from "./containerContext";
import { debug } from "./debug";
import { IConnectionArgs, DeltaManager, ReconnectMode } from "./deltaManager";
import { DeltaManagerProxy } from "./deltaManagerProxy";
import { ILoaderOptions, Loader, RelativeLoader } from "./loader";
import { pkgVersion } from "./packageVersion";
import { ConnectionStateHandler, ILocalSequencedClient } from "./connectionStateHandler";
import { RetriableDocumentStorageService } from "./retriableDocumentStorageService";
import { ProtocolTreeStorageService } from "./protocolTreeDocumentStorageService";
import { BlobOnlyStorage, ContainerStorageAdapter } from "./containerStorageAdapter";
import { getSnapshotTreeFromSerializedContainer } from "./utils";

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
    /**
     * Create the container on load, without an existing snapshot.
     * Used only for supporting legacy scenarios.
     *
     * @deprecated - avoid using this flow, this property is only for temporarily supporting a legacy scenario.
     */
    createOnLoad?: boolean;
}

export interface IContainerConfig {
    resolvedUrl?: IFluidResolvedUrl;
    canReconnect?: boolean;
    /**
     * Client details provided in the override will be merged over the default client.
     */
    clientDetailsOverride?: IClientDetails;
}

export enum ConnectionState {
    /**
     * The document is no longer connected to the delta server
     */
    Disconnected,

    /**
     * The document has an inbound connection but is still pending for outbound deltas
     */
    Connecting,

    /**
     * The document is fully connected
     */
    Connected,
}

/**
 * Waits until container connects to delta storage and gets up-to-date
 * Useful when resolving URIs and hitting 404, due to container being loaded from (stale) snapshot and not being
 * up to date. Host may chose to wait in such case and retry resolving URI.
 * Warning: Will wait infinitely for connection to establish if there is no connection.
 * May result in deadlock if Container.setAutoReconnect(false) is called and never switched back to auto-reconnect.
 * @returns true: container is up to date, it processed all the ops that were know at the time of first connection
 *          false: storage does not provide indication of how far the client is. Container processed
 *          all the ops known to it, but it maybe still behind.
 */
export async function waitContainerToCatchUp(container: Container) {
    // Make sure we stop waiting if container is closed.
    if (container.closed) {
        throw new Error("Container is closed");
    }

    return new Promise<boolean>((accept, reject) => {
        const deltaManager = container.deltaManager;

        container.on("closed", reject);

        const waitForOps = () => {
            assert(container.connectionState !== ConnectionState.Disconnected,
                0x0cd /* "Container disconnected while waiting for ops!" */);
            const hasCheckpointSequenceNumber = deltaManager.hasCheckpointSequenceNumber;

            const connectionOpSeqNumber = deltaManager.lastKnownSeqNumber;
            if (deltaManager.lastSequenceNumber === connectionOpSeqNumber) {
                accept(hasCheckpointSequenceNumber);
                return;
            }
            const callbackOps = (message) => {
                if (connectionOpSeqNumber <= message.sequenceNumber) {
                    accept(hasCheckpointSequenceNumber);
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

        container.resume();
    });
}

export class CollabWindowTracker {
    private opsCountSinceNoop = 0;
    private lastNoopTime: number  | undefined;

    constructor(
        private readonly submit: (type: MessageType, contents: any) => void,
        private readonly activeConnection: () => boolean,
        private readonly NoopTimeFrequency: number = 2000,
        private readonly NoopCountFrequency: number = 300,
    ) {}
    /**
     * Schedules as ack to the server to update the reference sequence number
     */
    public scheduleSequenceNumberUpdate(message: ISequencedDocumentMessage, immediateNoOp: boolean): void {
        // Exit early for inactive (not in quorum or not writers) clients.
        // They don't take part in the minimum sequence number calculation.
        if (!this.activeConnection()) {
            this.stopSequenceNumberUpdate();
            return;
        }

        // While processing a message, an immediate no-op can be requested.
        // i.e. to expedite approve or commit phase of quorum.
        if (immediateNoOp) {
            this.stopSequenceNumberUpdate();
            this.submit(MessageType.NoOp, ""); // This can be anything other than null
            return;
        }

        // Filter out system messages.
        if (isSystemMessage(message)) {
            return;
        }

        // We don't acknowledge no-ops to avoid acknowledgement cycles (i.e. ack the MSN
        // update, which updates the MSN, then ack the update, etc...). Also, don't
        // count system messages in ops count.
        assert(message.type !== MessageType.NoOp, 0x0ce /* "Don't acknowledge no-ops" */);

        if (this.lastNoopTime === undefined) {
            this.lastNoopTime = Date.now();
        }

        this.opsCountSinceNoop++;

        // If the ops count since last op is greater than NoopCountFrequency and time since last noop is
        // greater than NoopTimeFrequency, then send a Noop.
        // We will send a message(Noop) to update our reference sequence number upon receiving a server
        // operation. This allows the server to know our true reference sequence number and be able to
        // correctly update the minimum sequence number (MSN).
        if (this.opsCountSinceNoop >= this.NoopCountFrequency
            && Date.now() - this.lastNoopTime >= this.NoopTimeFrequency
        ) {
            this.stopSequenceNumberUpdate();
            this.submit(MessageType.NoOp, null);
        }
    }

    public stopSequenceNumberUpdate(): void {
        this.opsCountSinceNoop = 0;
        this.lastNoopTime = undefined;
    }
}

const getCodeProposal =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    (quorum: IQuorum) => quorum.get("code") ?? quorum.get("code2");

export class Container extends EventEmitterWithErrorHandling<IContainerEvents> implements IContainer {
    public static version = "^0.1.0";

    /**
     * Load an existing container.
     */
    public static async load(
        loader: Loader,
        loadOptions: IContainerLoadOptions,
        pendingLocalState?: unknown,
    ): Promise<Container> {
        const container = new Container(
            loader,
            {
                clientDetailsOverride: loadOptions.clientDetailsOverride,
                resolvedUrl: loadOptions.resolvedUrl,
                canReconnect: loadOptions.canReconnect,
            });

        return PerformanceEvent.timedExecAsync(
            container.logger,
            { eventName: "Load" },
            async (event) => new Promise<Container>((res, rej) => {
                const version = loadOptions.version;

                // always load unpaused with pending ops!
                // It is also default mode in general.
                const defaultMode: IContainerLoadMode = { opsBeforeReturn: "cached" };
                assert(pendingLocalState === undefined || loadOptions.loadMode === undefined,
                    0x1e1 /* "pending state requires immidiate connection!" */);
                const mode: IContainerLoadMode = loadOptions.loadMode ?? defaultMode;

                const onClosed = (err?: ICriticalContainerError) => {
                    rej(err ?? CreateContainerError("Container closed without an error"));
                };
                container.on("closed", onClosed);

                container.load(version, mode, pendingLocalState, loadOptions.createOnLoad)
                    .finally(() => {
                        container.removeListener("closed", onClosed);
                    })
                    .then((props) => {
                        event.end(props);
                        res(container);
                    },
                    (error) => {
                        const err = CreateContainerError(error);
                        // Depending where error happens, we can be attempting to connect to web socket
                        // and continuously retrying (consider offline mode)
                        // Host has no container to close, so it's prudent to do it here
                        container.close(error);
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
    ): Promise<Container> {
        const container = new Container(
            loader,
            {});
        await container.createDetached(codeDetails);
        return container;
    }

    /**
     * Create a new container in a detached state that is initialized with a
     * snapshot from a previous detached container.
     */
    public static async rehydrateDetachedFromSnapshot(
        loader: Loader,
        snapshot: string,
    ): Promise<Container> {
        const container = new Container(
            loader,
            {});
        const deserializedSummary = JSON.parse(snapshot) as ISummaryTree;
        await container.rehydrateDetachedFromSnapshot(deserializedSummary);
        return container;
    }

    public subLogger: TelemetryLogger;

    // Tells if container can reconnect on losing fist connection
    // If false, container gets closed on loss of connection.
    private readonly _canReconnect: boolean = true;

    private readonly logger: ITelemetryLogger;

    private loaded = false;
    private _attachState = AttachState.Detached;

    public readonly storage: IDocumentStorageService;
    private readonly storageBlobs = new Map<string, ArrayBufferLike>();
    // Active chaincode and associated runtime
    private _storageService: IDocumentStorageService & IDisposable | undefined;
    private get storageService(): IDocumentStorageService  {
        if (this._storageService === undefined) {
            throw new Error("Attempted to access storageService before it was defined");
        }
        return this._storageService;
    }

    private readonly clientDetailsOverride: IClientDetails | undefined;
    private readonly _deltaManager: DeltaManager;
    private service: IDocumentService | undefined;
    private readonly _audience: Audience;

    private _context: ContainerContext | undefined;
    private get context() {
        if (this._context === undefined) {
            throw new Error("Attempted to access context before it was defined");
        }
        return this._context;
    }
    private _protocolHandler: ProtocolOpHandler | undefined;
    private get protocolHandler() {
        if (this._protocolHandler === undefined) {
            throw new Error("Attempted to access protocolHandler before it was defined");
        }
        return this._protocolHandler;
    }

    private resumedOpProcessingAfterLoad = false;
    private firstConnection = true;
    private manualReconnectInProgress = false;
    private readonly connectionTransitionTimes: number[] = [];
    private messageCountAfterDisconnection: number = 0;
    private _loadedFromVersion: IVersion | undefined;
    private _resolvedUrl: IFluidResolvedUrl | undefined;
    private cachedAttachSummary: ISummaryTree | undefined;
    private attachInProgress = false;
    private _dirtyContainer = false;

    private lastVisible: number | undefined;
    private readonly connectionStateHandler: ConnectionStateHandler;

    private _closed = false;

    private readonly collabWindowTracker = new CollabWindowTracker(
        (type, contents) => this._deltaManager.submit(type, contents),
        () => this.activeConnection(),
        this.loader.services.options?.noopTimeFrequency,
        this.loader.services.options?.noopCountFrequency,
    );

    public get IFluidRouter(): IFluidRouter { return this; }

    public get resolvedUrl(): IResolvedUrl | undefined {
        return this._resolvedUrl;
    }

    public get loadedFromVersion(): IVersion | undefined {
        return this._loadedFromVersion;
    }

    /**
     * {@inheritDoc DeltaManager.readonly}
     * @deprecated - use readOnlyInfo
     */
    public get readonly() {
        return this._deltaManager.readonly;
    }

    /**
     * {@inheritDoc DeltaManager.readonlyPermissions}
     * @deprecated - use readOnlyInfo
     */
    public get readonlyPermissions() {
        return this._deltaManager.readonlyPermissions;
    }

    /**
     * {@inheritDoc DeltaManager.readOnlyInfo}
     */
    public get readOnlyInfo(): ReadOnlyInfo {
        return this._deltaManager.readOnlyInfo;
    }

    /**
     * {@inheritDoc DeltaManager.forceReadonly}
     */
    public forceReadonly(readonly: boolean) {
        this._deltaManager.forceReadonly(readonly);
    }

    public get closed(): boolean {
        return this._closed;
    }

    public get id(): string {
        return this._resolvedUrl?.id ?? "";
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
        return this._deltaManager.scopes;
    }

    public get clientDetails(): IClientDetails {
        return this._deltaManager.clientDetails;
    }

    /**
     * @deprecated use codeDetails
     */
    public get chaincodePackage(): IFluidCodeDetails | undefined {
        return this.codeDetails;
    }

    public get codeDetails(): IFluidCodeDetails | undefined {
        return this._context?.codeDetails ?? this.getCodeDetailsFromQuorum();
    }

    /**
     * Retrieves the audience associated with the document
     */
    public get audience(): IAudience {
        return this._audience;
    }

    /**
     * Returns true if container is dirty.
     * Which means data loss if container is closed at that same moment
     * Most likely that happens when there is no network connection to ordering service
     */
    public get isDirty() {
        return this._dirtyContainer;
    }

    private get serviceFactory() {return this.loader.services.documentServiceFactory;}
    private get urlResolver() {return this.loader.services.urlResolver;}
    public get options(): ILoaderOptions { return this.loader.services.options; }
    private get scope() { return this.loader.services.scope;}
    private get codeLoader() { return this.loader.services.codeLoader;}

    constructor(
        private readonly loader: Loader,
        config: IContainerConfig,
    ) {
        super();
        this._audience = new Audience();

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
                    loaderVersion: pkgVersion,
                    containerId: uuid(),
                    docId: () => this.id,
                    containerAttachState: () => this._attachState,
                    containerLoaded: () => this.loaded,
                },
                // we need to be judicious with our logging here to avoid generting too much data
                // all data logged here should be broadly applicable, and not specific to a
                // specific error or class of errors
                error: {
                    // load information to associate errors with the specific load point
                    dmInitialSeqNumber: () => this._deltaManager?.initialSequenceNumber,
                    dmLastKnownSeqNumber: () => this._deltaManager?.lastKnownSeqNumber,
                    containerLoadedFromVersionId: () => this.loadedFromVersion?.id,
                    containerLoadedFromVersionDate: () => this.loadedFromVersion?.date,
                    // message information to associate errors with the specific execution state
                    dmLastMsqSeqNumber: () => this.deltaManager?.lastMessage?.sequenceNumber,
                    dmLastMsqSeqTimestamp: () => this.deltaManager?.lastMessage?.timestamp,
                    dmLastMsqSeqClientId: () => this.deltaManager?.lastMessage?.clientId,
                },
            });

        // Prefix all events in this file with container-loader
        this.logger = ChildLogger.create(this.subLogger, "Container");

        this.connectionStateHandler = new ConnectionStateHandler(
            {
                protocolHandler: () => this._protocolHandler,
                logConnectionStateChangeTelemetry: (value, oldState, reason) =>
                    this.logConnectionStateChangeTelemetry(value, oldState, reason),
                shouldClientJoinWrite: () => this._deltaManager.shouldJoinWrite(),
                maxClientLeaveWaitTime: this.loader.services.options.maxClientLeaveWaitTime,
            },
            this.logger,
        );

        this.connectionStateHandler.on("connectionStateChanged", () => {
            if (this.loaded) {
                this.propagateConnectionState();
            }
        });

        this._deltaManager = this.createDeltaManager();
        this.storage = new ContainerStorageAdapter(
            () => {
                if (this.attachState !== AttachState.Attached) {
                    if (this.loader.services.detachedBlobStorage !== undefined) {
                        return new BlobOnlyStorage(this.loader.services.detachedBlobStorage, this.logger);
                    }
                    this.logger.sendErrorEvent({
                        eventName: "NoRealStorageInDetachedContainer",
                    });
                    throw new Error("Real storage calls not allowed in Unattached container");
                }
                return this.storageService;
            },
            this.storageBlobs,
        );

        const isDomAvailable = typeof document === "object" &&
            document !== null &&
            typeof document.addEventListener === "function" &&
            document.addEventListener !== null;
        // keep track of last time page was visible for telemetry
        if (isDomAvailable) {
            this.lastVisible = document.hidden ? performance.now() : undefined;
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    this.lastVisible = performance.now();
                } else {
                    // settimeout so this will hopefully fire after disconnect event if being hidden caused it
                    setTimeout(() => this.lastVisible = undefined, 0);
                }
            });
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
                            listener(this._dirtyContainer);
                        }
                        break;
                    case savedContainerEvent:
                        if (!this._dirtyContainer) {
                            listener(this._dirtyContainer);
                        }
                        break;
                    case connectedEventName:
                         if (this.connected) {
                            listener(event, this.clientId);
                         }
                         break;
                    case disconnectedEventName:
                        if (!this.connected) {
                            listener(event);
                        }
                        break;
                    default:
                }
            }).catch((error) =>  {
                this.logger.sendErrorEvent({ eventName: "RaiseConnectedEventError" }, error);
            });
        });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum {
        return this.protocolHandler.quorum;
    }

    public close(error?: ICriticalContainerError) {
        if (this._closed) {
            return;
        }
        this._closed = true;

        this.collabWindowTracker.stopSequenceNumberUpdate();
        this._deltaManager.close(error);

        this._protocolHandler?.close();

        this._context?.dispose(error !== undefined ? new Error(error.message) : undefined);

        assert(this.connectionState === ConnectionState.Disconnected, 0x0cf /* "disconnect event was not raised!" */);

        this._storageService?.dispose();

        // Notify storage about critical errors. They may be due to disconnect between client & server knowledge about
        // file, like file being overwritten in storage, but client having stale local cache.
        // Driver need to ensure all caches are cleared on critical errors
        this.service?.dispose(error);

        if (error !== undefined) {
            this.logger.sendErrorEvent(
                {
                    eventName: "ContainerClose",
                    lastSequenceNumber: this._deltaManager.lastSequenceNumber,
                },
                error,
            );
        } else {
            assert(this.loaded, 0x0d0 /* "Container in non-loaded state before close!" */);
            this.logger.sendTelemetryEvent({ eventName: "ContainerClose" });
        }

        this.emit("closed", error);

        this.removeAllListeners();
    }

    public closeAndGetPendingLocalState(): string {
        // runtime matches pending ops to successful ones by clientId and client seq num, so we need to close the
        // container at the same time we get pending state, otherwise this container could reconnect and resubmit with
        // a new clientId and a future container using stale pending state without the new clientId would resubmit them
        this._deltaManager.close();

        assert(this.attachState === AttachState.Attached, 0x0d1 /* "Container should be attached before close" */);
        assert(this.resolvedUrl !== undefined && this.resolvedUrl.type === "fluid",
            0x0d2 /* "resolved url should be valid Fluid url" */);
        const pendingState: IPendingLocalState = {
            pendingRuntimeState: this.context.getPendingLocalState(),
            url: this.resolvedUrl.url,
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
        return JSON.stringify(combinedSummary);
    }

    public async attach(request: IRequest): Promise<void> {
        assert(this.loaded, 0x0d4 /* "not loaded" */);
        assert(!this.closed, 0x0d5 /* "closed" */);

        // If container is already attached or attach is in progress, return.
        if (this._attachState === AttachState.Attached || this.attachInProgress) {
            return;
        }

        this.attachInProgress = true;
        try {
            assert(this.deltaManager.inbound.length === 0, 0x0d6 /* "Inbound queue should be empty when attaching" */);
            // Only take a summary if the container is in detached state, otherwise we could have local changes.
            // In failed attach call, we would already have a summary cached.
            if (this._attachState === AttachState.Detached) {
                // Get the document state post attach - possibly can just call attach but we need to change the
                // semantics around what the attach means as far as async code goes.
                const appSummary: ISummaryTree = this.context.createSummary();
                const protocolSummary = this.captureProtocolSummary();
                this.cachedAttachSummary = combineAppAndProtocolSummary(appSummary, protocolSummary);

                // Set the state as attaching as we are starting the process of attaching container.
                // This should be fired after taking the summary because it is the place where we are
                // starting to attach the container to storage.
                // Also, this should only be fired in detached container.
                this._attachState = AttachState.Attaching;
                this.emit("attaching");
            }
            assert(!!this.cachedAttachSummary,
                0x0d7 /* "Summary should be there either by this attach call or previous attach call!!" */);

            const createNewResolvedUrl = await this.urlResolver.resolve(request);
            ensureFluidResolvedUrl(createNewResolvedUrl);
            const summary = this.cachedAttachSummary;
            // Actually go and create the resolved document
            if (this.service === undefined) {
                this.service = await runWithRetry(
                    async () => this.serviceFactory.createContainer(
                        summary,
                        createNewResolvedUrl,
                        this.subLogger,
                    ),
                    "containerAttach",
                    (id: string) => this._deltaManager.refreshDelayInfo(id),
                    (id: string, delayMs: number, error: any) =>
                        this._deltaManager.emitDelayInfo(id, delayMs, error),
                    this.logger,
                );
            }
            const resolvedUrl = this.service.resolvedUrl;
            ensureFluidResolvedUrl(resolvedUrl);
            this._resolvedUrl = resolvedUrl;
            await this.connectStorageService();

            // This we can probably just pass the storage service to the blob manager - although ideally
            // there just isn't a blob manager
            this._attachState = AttachState.Attached;
            this.emit("attached");
            this.cachedAttachSummary = undefined;

            // Propagate current connection state through the system.
            this.propagateConnectionState();
            if (!this.closed) {
                this.resumeInternal({ fetchOpsFromStorage: false, reason: "createDetached" });
            }
        } catch(error) {
            if (!canRetryOnError(error)) {
                this.close(error);
            }
            throw error;
        } finally {
            this.attachInProgress = false;
        }
    }

    public async request(path: IRequest): Promise<IResponse> {
        return PerformanceEvent.timedExecAsync(this.logger, { eventName: "Request" }, async () => {
            return this.context.request(path);
        });
    }

    public async snapshot(tagMessage: string, fullTree: boolean = false): Promise<void> {
        // Only snapshot once a code quorum has been established
        if (!this.protocolHandler.quorum.has("code") && !this.protocolHandler.quorum.has("code2")) {
            this.logger.sendTelemetryEvent({ eventName: "SkipSnapshot" });
            return;
        }

        // Stop inbound message processing while we complete the snapshot
        try {
            await this.deltaManager.inbound.pause();
            await this.snapshotCore(tagMessage, fullTree);
        } catch (ex) {
            this.logger.sendErrorEvent({ eventName: "SnapshotExceptionError" }, ex);
            throw ex;
        } finally {
            this.deltaManager.inbound.resume();
        }
    }

    public setAutoReconnect(reconnect: boolean) {
        if (reconnect && this.closed) {
            throw new Error("Attempting to setAutoReconnect() a closed DeltaManager");
        }

        this._deltaManager.setAutomaticReconnect(reconnect);

        this.logger.sendTelemetryEvent({
            eventName: reconnect ? "AutoReconnectEnabled" : "AutoReconnectDisabled",
            connectionMode: this._deltaManager.connectionMode,
            connectionState: ConnectionState[this.connectionState],
        });

        // If container state is not attached and resumed, then don't connect to delta stream. Also don't set the
        // manual reconnection flag to true as we haven't made the initial connection yet.
        if (reconnect && this._attachState === AttachState.Attached && this.resumedOpProcessingAfterLoad) {
            if (this.connectionState === ConnectionState.Disconnected) {
                // Only track this as a manual reconnection if we are truly the ones kicking it off.
                this.manualReconnectInProgress = true;
            }

            // Ensure connection to web socket
            this.connectToDeltaStream({ reason: "autoReconnect" }).catch((error) => {
                // All errors are reported through events ("error" / "disconnected") and telemetry in DeltaManager
                // So there shouldn't be a need to record error here.
                // But we have number of cases where reconnects do not happen, and no errors are recorded, so
                // adding this log point for easier diagnostics
                this.logger.sendTelemetryEvent({ eventName: "setAutoReconnectError" }, error);
            });
        }
    }

    public resume() {
        if (!this.closed) {
            // Note: no need to fetch ops as we do it preemptively as part of DeltaManager.attachOpHandler().
            // If there is gap, we will learn about it once connected, but the gap should be small (if any),
            // assuming that resume() is called quickly after initial container boot.
            this.resumeInternal({ reason: "DocumentOpenResume", fetchOpsFromStorage: false });
        }
    }

    protected resumeInternal(args: IConnectionArgs) {
        assert(!this.closed, 0x0d9 /* "Attempting to setAutoReconnect() a closed DeltaManager" */);

        // Resume processing ops
        if (!this.resumedOpProcessingAfterLoad) {
            this.resumedOpProcessingAfterLoad = true;
            this._deltaManager.inbound.resume();
            this._deltaManager.inboundSignal.resume();
        }

        // Ensure connection to web socket
        // All errors are reported through events ("error" / "disconnected") and telemetry in DeltaManager
        this.connectToDeltaStream(args).catch(() => { });
    }

    /**
     * Raise non-critical error to host. Calling this API will not close container.
     * For critical errors, please call Container.close(error).
     * @param error - an error to raise
     */
    public raiseContainerWarning(warning: ContainerWarning) {
        // Some "warning" events come from outside the container and are logged
        // elsewhere (e.g. summarizing container). We shouldn't log these here.
        if (warning.logged !== true) {
            this.logContainerError(warning);
        }
        this.emit("warning", warning);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.resolvedUrl === undefined) {
            return undefined;
        }

        return this.urlResolver.getAbsoluteUrl(
            this.resolvedUrl,
            relativeUrl,
            this._context?.codeDetails);
    }

    public async proposeCodeDetails(codeDetails: IFluidCodeDetails) {
        if (!isFluidCodeDetails(codeDetails)) {
            throw new Error("Provided codeDetails are not IFluidCodeDetails");
        }

        if (this.codeLoader.IFluidCodeDetailsComparer) {
            const comparision = await this.codeLoader.IFluidCodeDetailsComparer.compare(
                codeDetails,
                this.getCodeDetailsFromQuorum());
            if (comparision !== undefined && comparision <= 0) {
                throw new Error("Proposed code details should be greater than the current");
            }
        }

        return this.getQuorum().propose("code", codeDetails)
            .then(()=>true)
            .catch(()=>false);
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

        this.close(CreateContainerError(
            new Error("ExistingContextDoesNotSatisfyIncomingProposal")));
    }

    private async snapshotCore(tagMessage: string, fullTree: boolean = false) {
        // Snapshots base document state and currently running context
        const root = this.snapshotBase();
        const dataStoreEntries = await this.context.snapshot(tagMessage, fullTree);

        // And then combine
        if (dataStoreEntries !== null) {
            root.entries.push(...dataStoreEntries.entries);
        }

        // Generate base snapshot message
        const deltaDetails =
            `${this._deltaManager.lastSequenceNumber}:${this._deltaManager.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.getVersion(this.id);

        const parents = lastVersion !== undefined ? [lastVersion.id] : [];

        // Write the full snapshot
        return this.storageService.write(root, parents, message, "");
    }

    private snapshotBase(): ITree {
        const entries: ITreeEntry[] = [];

        const quorumSnapshot = this.protocolHandler.quorum.snapshot();
        entries.push({
            mode: FileMode.File,
            path: "quorumMembers",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.members),
                encoding: "utf-8",
            },
        });
        entries.push({
            mode: FileMode.File,
            path: "quorumProposals",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.proposals),
                encoding: "utf-8",
            },
        });
        entries.push({
            mode: FileMode.File,
            path: "quorumValues",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(quorumSnapshot.values),
                encoding: "utf-8",
            },
        });

        // Save attributes for the document
        const documentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.lastSequenceNumber,
            term: this._deltaManager.referenceTerm,
        };
        entries.push({
            mode: FileMode.File,
            path: ".attributes",
            type: TreeEntry.Blob,
            value: {
                contents: JSON.stringify(documentAttributes),
                encoding: "utf-8",
            },
        });

        // Output the tree
        const root: ITree = {
            entries,
        };

        return root;
    }

    private async getVersion(version: string): Promise<IVersion | undefined> {
        const versions = await this.storageService.getVersions(version, 1);
        return versions[0];
    }

    private recordConnectStartTime() {
        if (this.connectionTransitionTimes[ConnectionState.Disconnected] === undefined) {
            this.connectionTransitionTimes[ConnectionState.Disconnected] = performance.now();
        }
    }

    private async connectToDeltaStream(args: IConnectionArgs) {
        this.recordConnectStartTime();

        // All agents need "write" access, including summarizer.
        if (!this._canReconnect || !this.client.details.capabilities.interactive) {
            args.mode = "write";
        }

        return this._deltaManager.connect(args);
    }

    /**
     * Load container.
     *
     * @param specifiedVersion - one of the following
     *   - undefined - fetch latest snapshot
     *   - otherwise, version sha to load snapshot
     * @param createIfNotExisting - create the container when there is no container to load.
     *        Avoid using this flag, its goal is temporarily supporting a legacy scenario.
     */
    private async load(
        specifiedVersion: string | undefined,
        loadMode: IContainerLoadMode,
        pendingLocalState?: unknown,
        createIfNotExisting?: boolean,
    ) {
        if (this._resolvedUrl === undefined) {
            throw new Error("Attempting to load without a resolved url");
        }
        this.service = await this.serviceFactory.createDocumentService(this._resolvedUrl, this.subLogger);

        let startConnectionP: Promise<IConnectionDetails> | undefined;

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
            startConnectionP = this.connectToDeltaStream(connectionArgs);
            startConnectionP.catch((error) => { });
        }

        await this.connectStorageService();
        this._attachState = AttachState.Attached;

        // Fetch specified snapshot.
        const { snapshot, versionId } = await this.fetchSnapshotTree(specifiedVersion);

        const attributes = await this.getDocumentAttributes(this.storageService, snapshot);

        // Attach op handlers to start processing ops
        this.attachDeltaManagerOpHandler(attributes);

        // ...load in the existing quorum
        // Initialize the protocol handler
        const protocolHandlerP =
            this.loadAndInitializeProtocolState(attributes, this.storageService, snapshot);

        let opsBeforeReturnP: Promise<void> | undefined;

        // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
        // the initial details
        let existing = true;
        if (snapshot !== undefined) {
            switch (loadMode.opsBeforeReturn) {
                case undefined:
                    if (loadMode.deltaConnection !== "none") {
                        // Start prefetch, but not set opsBeforeReturnP - boot is not blocked by it!
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        this._deltaManager.preFetchOps(false);
                    }
                    break;
                case "cached":
                    opsBeforeReturnP = this._deltaManager.preFetchOps(true);
                    // Keep going with fetching ops from storage once we have all cached ops in.
                    // Ops processing will start once cached ops are in and and will stop when queue is empty
                    // (which in most cases will happen when we are done processing cached ops)
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    opsBeforeReturnP.then(async () => this._deltaManager.preFetchOps(false));
                    break;
                case "all":
                    opsBeforeReturnP = this._deltaManager.preFetchOps(false);
                    break;
                default:
                    unreachableCase(loadMode.opsBeforeReturn);
            }
        } else {
            //
            // THIS IS LEGACY PATH
            // The code is maintained for the snapshot back compat tests
            //
            assert(createIfNotExisting === true, 0x1fb /* "Snapshot should already exist" */);

            if (startConnectionP === undefined) {
                startConnectionP = this.connectToDeltaStream(connectionArgs);
            }
            // Intentionally don't .catch on this promise - we'll let any error throw below in the await.
            const details = await startConnectionP;
            existing = details.existing;
        }

        this._protocolHandler = await protocolHandlerP;

        const codeDetails = this.getCodeDetailsFromQuorum();
        await this.instantiateContext(
            existing,
            attributes,
            codeDetails,
            snapshot,
            pendingLocalState,
        );

        // Propagate current connection state through the system.
        this.propagateConnectionState();

        // Internal context is fully loaded at this point
        this.loaded = true;

        // We might have hit some failure that did not manifest itself in exception in this flow,
        // do not start op processing in such case - static version of Container.load() will handle it correctly.
        if (!this.closed) {
            if (opsBeforeReturnP !== undefined) {
                this._deltaManager.inbound.resume();

                await opsBeforeReturnP;
                await this._deltaManager.inbound.waitTillProcessingDone();

                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this._deltaManager.inbound.pause();
            }

            switch (loadMode.deltaConnection) {
                case undefined:
                    this.resume();
                    break;
                case "delayed":
                    this.resumedOpProcessingAfterLoad = true;
                    this._deltaManager.inbound.resume();
                    this._deltaManager.inboundSignal.resume();
                    break;
                case "none":
                    break;
                default:
                    unreachableCase(loadMode.deltaConnection);
            }
        }

        // Safety net: static version of Container.load() should have got this message through "closed" handler.
        // But if that did not happen for some reason, fail load for sure.
        // Otherwise we can get into situations where container is closed and does not try to connect to ordering
        // service, but caller does not know that (callers do expect container to be not closed on successful path
        // and listen only on "closed" event)
        if (this.closed) {
            throw new Error("Container was closed while load()");
        }

        return {
            sequenceNumber: attributes.sequenceNumber,
            version: versionId,
        };
    }

    private async createDetached(source: IFluidCodeDetails) {
        const attributes: IDocumentAttributes = {
            branch: "",
            sequenceNumber: detachedContainerRefSeqNumber,
            term: 1,
            minimumSequenceNumber: 0,
        };

        // Seed the base quorum to be an empty list with a code quorum set
        const committedCodeProposal: ICommittedProposal = {
            key: "code",
            value: source,
            approvalSequenceNumber: 0,
            commitSequenceNumber: 0,
            sequenceNumber: 0,
        };

        const members: [string, ISequencedClient][] = [];
        const proposals: [number, ISequencedProposal, string[]][] = [];
        const values: [string, ICommittedProposal][] = [["code", committedCodeProposal]];

        this.attachDeltaManagerOpHandler(attributes);

        // Need to just seed the source data in the code quorum. Quorum itself is empty
        this._protocolHandler = await this.initializeProtocolState(
            attributes,
            members,
            proposals,
            values);

        // The load context - given we seeded the quorum - will be great
        await this.instantiateContextDetached(
            false, // existing
            attributes,
        );

        this.propagateConnectionState();

        this.loaded = true;
    }

    private async rehydrateDetachedFromSnapshot(detachedContainerSnapshot: ISummaryTree) {
        const { snapshotTree, blobs } = getSnapshotTreeFromSerializedContainer(detachedContainerSnapshot);
        blobs.forEach((value, key) => {
            this.storageBlobs.set(key, value);
        });
        const attributes = await this.getDocumentAttributes(undefined, snapshotTree);
        assert(attributes.sequenceNumber === 0, 0x0db /* "Seq number in detached container should be 0!!" */);
        this.attachDeltaManagerOpHandler(attributes);

        // ...load in the existing quorum
        // Initialize the protocol handler
        this._protocolHandler =
            await this.loadAndInitializeProtocolState(attributes, undefined, snapshotTree);

        await this.instantiateContextDetached(
            true, // existing
            attributes,
            snapshotTree,
        );

        this.loaded = true;

        this.propagateConnectionState();
    }

    private async connectStorageService(): Promise<void> {
        if (this._storageService !== undefined) {
            return;
        }

        assert(this.service !== undefined, 0x1ef /* "services must be defined" */);
        const storageService = await this.service.connectToStorage();

        this._storageService =
            new RetriableDocumentStorageService(storageService, this._deltaManager, this.logger);

        if(this.options.summarizeProtocolTree === true) {
            this._storageService =
                new ProtocolTreeStorageService(this._storageService, ()=>this.captureProtocolSummary());
        }

        // ensure we did not lose that policy in the process of wrapping
        assert(storageService.policies?.minBlobSize === this.storageService.policies?.minBlobSize,
            0x0e0 /* "lost minBlobSize policy" */);
    }

    private async getDocumentAttributes(
        storage: IDocumentStorageService | undefined,
        tree: ISnapshotTree | undefined,
    ): Promise<IDocumentAttributes> {
        if (tree === undefined) {
            return {
                branch: this.id,
                minimumSequenceNumber: 0,
                sequenceNumber: 0,
                term: 1,
            };
        }

        // Backward compatibility: old docs would have ".attributes" instead of "attributes"
        const attributesHash = ".protocol" in tree.trees
            ? tree.trees[".protocol"].blobs.attributes
            : tree.blobs[".attributes"];

        const attributes = storage !== undefined ? await readAndParse<IDocumentAttributes>(storage, attributesHash)
            : readAndParseFromBlobs<IDocumentAttributes>(tree.trees[".protocol"].blobs, attributesHash);

        // Backward compatibility for older summaries with no term
        if (attributes.term === undefined) {
            attributes.term = 1;
        }

        return attributes;
    }

    private async loadAndInitializeProtocolState(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService | undefined,
        snapshot: ISnapshotTree | undefined,
    ): Promise<ProtocolOpHandler> {
        let members: [string, ISequencedClient][] = [];
        let proposals: [number, ISequencedProposal, string[]][] = [];
        let values: [string, any][] = [];

        if (snapshot !== undefined) {
            const baseTree = ".protocol" in snapshot.trees ? snapshot.trees[".protocol"] : snapshot;
            if (storage !== undefined) {
                [members, proposals, values] = await Promise.all([
                    readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers),
                    readAndParse<[number, ISequencedProposal, string[]][]>(storage, baseTree.blobs.quorumProposals),
                    readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues),
                ]);
            } else {
                members = readAndParseFromBlobs<[string, ISequencedClient][]>(snapshot.trees[".protocol"].blobs,
                    baseTree.blobs.quorumMembers);
                proposals = readAndParseFromBlobs<[number, ISequencedProposal, string[]][]>(
                    snapshot.trees[".protocol"].blobs, baseTree.blobs.quorumProposals);
                values = readAndParseFromBlobs<[string, ICommittedProposal][]>(snapshot.trees[".protocol"].blobs,
                    baseTree.blobs.quorumValues);
            }
        }

        const protocolHandler = await this.initializeProtocolState(
            attributes,
            members,
            proposals,
            values);

        return protocolHandler;
    }

    private async initializeProtocolState(
        attributes: IDocumentAttributes,
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, any][],
    ): Promise<ProtocolOpHandler> {
        const protocol = new ProtocolOpHandler(
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            attributes.term,
            members,
            proposals,
            values,
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            (sequenceNumber) => this.submitMessage(MessageType.Reject, sequenceNumber));

        const protocolLogger = ChildLogger.create(this.subLogger, "ProtocolHandler");

        protocol.quorum.on("error", (error) => {
            protocolLogger.sendErrorEvent(error);
        });

        // Track membership changes and update connection state accordingly
        protocol.quorum.on("addMember", (clientId, details) => {
            this.connectionStateHandler.receivedAddMemberEvent(clientId);
        });

        protocol.quorum.on("removeMember", (clientId) => {
            this.connectionStateHandler.receivedRemoveMemberEvent(clientId);
        });

        protocol.quorum.on("addProposal", (proposal: IPendingProposal) => {
            if (proposal.key === "code" || proposal.key === "code2") {
                this.emit("codeDetailsProposed", proposal.value, proposal);
            }
        });

        protocol.quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                debug(`approved ${key}`);
                if (key === "code" || key === "code2") {
                    debug(`codeProposal ${JSON.stringify(value)}`);
                    if (!isFluidCodeDetails(value)) {
                        this.logger.sendErrorEvent({
                                eventName: "CodeProposalNotIFluidCodeDetails",
                        });
                    }
                    this.processCodeProposal().catch((error) => {
                        this.close(CreateContainerError(error));
                        throw error;
                    });
                }
            });

        return protocol;
    }

    private captureProtocolSummary(): ISummaryTree {
        const quorumSnapshot = this.protocolHandler.quorum.snapshot();

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this.protocolHandler.minimumSequenceNumber,
            sequenceNumber: this.protocolHandler.sequenceNumber,
            term: this.protocolHandler.term,
        };

        const summary: ISummaryTree = {
            tree: {
                attributes: {
                    content: JSON.stringify(documentAttributes),
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

        return client;
    }

    /**
     * Returns true if connection is active, i.e. it's "write" connection and
     * container runtime was notified about this connection (i.e. we are up-to-date and could send ops).
     * This happens after client received its own joinOp and thus is in the quorum.
     * If it's not true, runtime is not in position to send ops.
     */
    private activeConnection() {
        return this.connectionState === ConnectionState.Connected && this._deltaManager.connectionMode === "write";
    }

    private createDeltaManager() {
        const deltaManager: DeltaManager = new DeltaManager(
            () => this.service,
            this.client,
            ChildLogger.create(this.subLogger, "DeltaManager"),
            this._canReconnect,
            () => this.activeConnection(),
        );

        // Disable inbound queues as Container is not ready to accept any ops until we are fully loaded!
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        deltaManager.inbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        deltaManager.inboundSignal.pause();

        deltaManager.on("connect", (details: IConnectionDetails, opsBehind?: number) => {
            this.connectionStateHandler.receivedConnectEvent(
                this._deltaManager.connectionMode,
                details,
                opsBehind,
            );

            // Back-compat for new client and old server.
            this._audience.clear();

            for (const priorClient of details.initialClients ?? []) {
                this._audience.addMember(priorClient.clientId, priorClient.client);
            }
        });

        deltaManager.on("disconnect", (reason: string) => {
            this.manualReconnectInProgress = false;
            this.connectionStateHandler.receivedDisconnectEvent(reason);
        });

        deltaManager.on("throttled", (warning: IThrottlingWarning) => {
            this.raiseContainerWarning(warning);
        });

        deltaManager.on("readonly", (readonly) => {
            this.emit("readonly", readonly);
        });

        deltaManager.on("closed", (error?: ICriticalContainerError) => {
            this.close(error);
        });

        return deltaManager;
    }

    private attachDeltaManagerOpHandler(attributes: IDocumentAttributes): void {
        this._deltaManager.attachOpHandler(
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            attributes.term ?? 1,
            {
                process: (message) => this.processRemoteMessage(message),
                processSignal: (message) => {
                    this.processSignal(message);
                },
            });
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
        let connectionMode: string | undefined;
        let connectionInitiationReason: string | undefined;
        let autoReconnect: ReconnectMode | undefined;
        let checkpointSequenceNumber: number | undefined;
        let sequenceNumber: number | undefined;
        let opsBehind: number | undefined;
        if (value === ConnectionState.Disconnected) {
            autoReconnect = this._deltaManager.reconnectMode;
        } else {
            connectionMode = this._deltaManager.connectionMode;
            sequenceNumber = this.deltaManager.lastSequenceNumber;
            if (value === ConnectionState.Connected) {
                durationFromDisconnected = time - this.connectionTransitionTimes[ConnectionState.Disconnected];
                durationFromDisconnected = TelemetryLogger.formatTick(durationFromDisconnected);
            } else {
                // This info is of most interest on establishing connection only.
                checkpointSequenceNumber = this.deltaManager.lastKnownSeqNumber;
                if (this.deltaManager.hasCheckpointSequenceNumber) {
                    opsBehind = checkpointSequenceNumber - sequenceNumber;
                }
            }
            if (this.firstConnection) {
                connectionInitiationReason = "InitialConnect";
            } else if (this.manualReconnectInProgress) {
                connectionInitiationReason = "ManualReconnect";
            } else {
                connectionInitiationReason = "AutoReconnect";
            }
        }

        this.logger.sendPerformanceEvent({
            eventName: `ConnectionStateChange_${ConnectionState[value]}`,
            from: ConnectionState[oldState],
            duration,
            durationFromDisconnected,
            reason,
            connectionInitiationReason,
            socketDocumentId: this._deltaManager.socketDocumentId,
            pendingClientId: this.connectionStateHandler.pendingClientId,
            clientId: this.clientId,
            connectionMode,
            autoReconnect,
            opsBehind,
            online: OnlineStatus[isOnline()],
            lastVisible: this.lastVisible !== undefined ? performance.now() - this.lastVisible : undefined,
            checkpointSequenceNumber,
            sequenceNumber,
        });

        if (value === ConnectionState.Connected) {
            this.firstConnection = false;
            this.manualReconnectInProgress = false;
        }
    }

    private propagateConnectionState() {
        const logOpsOnReconnect: boolean =
            this.connectionState === ConnectionState.Connected &&
            !this.firstConnection &&
            this._deltaManager.connectionMode === "write";
        if (logOpsOnReconnect) {
            this.messageCountAfterDisconnection = 0;
        }

        const state = this.connectionState === ConnectionState.Connected;
        if (!this.context.disposed) {
            this.context.setConnectionState(state, this.clientId);
        }
        assert(this.protocolHandler !== undefined, 0x0dc /* "Protocol handler should be set here" */);
        this.protocolHandler.quorum.setConnectionState(state, this.clientId);
        raiseConnectedEvent(this.logger, this, state, this.clientId);

        if (logOpsOnReconnect) {
            this.logger.sendTelemetryEvent(
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
                if(summary.details === undefined) {
                    summary.details = {};
                }
                summary.details.includesProtocolTree =
                    this.options.summarizeProtocolTree === true;
                break;
            }
            default:
                this.close(CreateContainerError(`Runtime can't send arbitrary message type: ${type}`));
                return -1;
        }
        return this.submitMessage(type, contents, batch, metadata);
    }

    private submitMessage(type: MessageType, contents: any, batch?: boolean, metadata?: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            this.logger.sendErrorEvent({ eventName: "SubmitMessageWithNoConnection", type });
            return -1;
        }

        this.messageCountAfterDisconnection += 1;
        this.collabWindowTracker.stopSequenceNumberUpdate();
        return this._deltaManager.submit(type, contents, batch, metadata);
    }

    private processRemoteMessage(message: ISequencedDocumentMessage): IProcessMessageResult {
        // Check and report if we're getting messages from a clientId that we previously
        // flagged as shouldHaveLeft, or from a client that's not in the quorum but should be
        if (message.clientId != null) {
            let errorMsg: string | undefined;
            const client: ILocalSequencedClient | undefined =
                this.getQuorum().getMember(message.clientId);
            if (client === undefined && message.type !== MessageType.ClientJoin) {
                errorMsg = "messageClientIdMissingFromQuorum";
            } else if (client?.shouldHaveLeft === true && message.type !== MessageType.NoOp) {
                errorMsg = "messageClientIdShouldHaveLeft";
            }
            if (errorMsg !== undefined) {
                const error = new DataCorruptionError(
                    errorMsg,
                    extractSafePropertiesFromMessage(message));
                this.close(CreateContainerError(error));
            }
        }

        const local = this.clientId === message.clientId;

        // Forward non system messages to the loaded runtime for processing
        if (!isSystemMessage(message)) {
            this.context.process(message, local, undefined);
        }

        // Allow the protocol handler to process the message
        const result = this.protocolHandler.processMessage(message, local);
        this.collabWindowTracker.scheduleSequenceNumberUpdate(message, result.immediateNoOp === true);

        this.emit("op", message);

        return result;
    }

    private submitSignal(message: any) {
        this._deltaManager.submitSignal(JSON.stringify(message));
    }

    private processSignal(message: ISignalMessage) {
        // No clientId indicates a system signal message.
        if (message.clientId === null) {
            const innerContent = message.content as { content: any; type: string };
            if (innerContent.type === MessageType.ClientJoin) {
                const newClient = innerContent.content as ISignalClient;
                this._audience.addMember(newClient.clientId, newClient.client);
            } else if (innerContent.type === MessageType.ClientLeave) {
                const leftClientId = innerContent.content as string;
                this._audience.removeMember(leftClientId);
            }
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
        Promise<{snapshot?: ISnapshotTree; versionId?: string}>
    {
        const version = await this.getVersion(specifiedVersion ?? this.id);

        if (version === undefined && specifiedVersion !== undefined) {
            // We should have a defined version to load from if specified version requested
            this.logger.sendErrorEvent({ eventName: "NoVersionFoundWhenSpecified", id: specifiedVersion });
        }
        this._loadedFromVersion = version;
        const snapshot = await this.storageService.getSnapshotTree(version) ?? undefined;

        if (snapshot === undefined && version !== undefined) {
            this.logger.sendErrorEvent({ eventName: "getSnapshotTreeFailed", id: version.id });
        }
        return { snapshot, versionId: version?.id };
    }

    private async instantiateContextDetached(
        existing: boolean,
        attributes: IDocumentAttributes,
        snapshot?: ISnapshotTree,
        pendingLocalState?: unknown,
    ) {
        const codeDetails = this.getCodeDetailsFromQuorum();
        if (codeDetails === undefined) {
            throw new Error("pkg should be provided in create flow!!");
        }

        await this.instantiateContext(
            existing,
            attributes,
            codeDetails,
            snapshot,
            pendingLocalState,
        );
    }

    private async instantiateContext(
        existing: boolean,
        attributes: IDocumentAttributes,
        codeDetails: IFluidCodeDetails,
        snapshot?: ISnapshotTree,
        pendingLocalState?: unknown,
    ) {
        assert(this._context?.disposed !== false, 0x0dd /* "Existing context not disposed" */);
        // If this assert fires, our state tracking is likely not synchronized between COntainer & runtime.
        if (this._dirtyContainer) {
            this.logger.sendErrorEvent({ eventName: "DirtyContainerReloadContainer" });
        }

        // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
        // are set. Global requests will still go directly to the loader
        const loader = new RelativeLoader(this, this.loader);
        this._context = await ContainerContext.createOrLoad(
            this,
            this.scope,
            this.codeLoader,
            codeDetails,
            snapshot,
            attributes,
            new DeltaManagerProxy(this._deltaManager),
            new QuorumProxy(this.protocolHandler.quorum),
            loader,
            (warning: ContainerWarning) => this.raiseContainerWarning(warning),
            (type, contents, batch, metadata) => this.submitContainerMessage(type, contents, batch, metadata),
            (message) => this.submitSignal(message),
            (error?: ICriticalContainerError) => this.close(error),
            Container.version,
            (dirty: boolean) => {
                this._dirtyContainer = dirty;
                this.emit(dirty ? dirtyContainerEvent : savedContainerEvent);
            },
            existing,
            pendingLocalState,
        );

        this.emit("contextChanged", codeDetails);
    }

    // Please avoid calling it directly.
    // raiseContainerWarning() is the right flow for most cases
    private logContainerError(warning: ContainerWarning) {
        this.logger.sendErrorEvent({ eventName: "ContainerWarning" }, warning);
    }
}
