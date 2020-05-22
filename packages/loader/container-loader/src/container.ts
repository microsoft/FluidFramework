/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as uuid from "uuid";
import {
    ITelemetryBaseLogger,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { IComponent, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    ICodeLoader,
    IConnectionDetails,
    IContainer,
    IContainerEvents,
    IDeltaManager,
    IFluidCodeDetails,
    IFluidModule,
    IGenericBlob,
    IRuntimeFactory,
    LoaderHeader,
    IRuntimeState,
    CriticalContainerError,
    ContainerWarning,
    IThrottlingWarning,
} from "@fluidframework/container-definitions";
import {
    ChildLogger,
    EventEmitterWithErrorHandling,
    PerformanceEvent,
    performanceNow,
    raiseConnectedEvent,
    TelemetryLogger,
} from "@fluidframework/common-utils";
import {
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IUrlResolver,
    IDocumentServiceFactory,
    IResolvedUrl,
    CreateNewHeader,
} from "@fluidframework/driver-definitions";
import {
    CreateContainerError,
    readAndParse,
    OnlineStatus,
    isOnline,
    ensureFluidResolvedUrl,
    combineAppAndProtocolSummary,
} from "@fluidframework/driver-utils";
import {
    buildSnapshotTree,
    isSystemMessage,
    ProtocolOpHandler,
    QuorumProxy,
} from "@fluidframework/protocol-base";
import {
    FileMode,
    IClient,
    IClientDetails,
    ICommittedProposal,
    IDocumentAttributes,
    IDocumentMessage,
    IProcessMessageResult,
    IQuorum,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    IVersion,
    MessageType,
    TreeEntry,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import { Audience } from "./audience";
import { BlobManager } from "./blobManager";
import { ContainerContext } from "./containerContext";
import { debug } from "./debug";
import { IConnectionArgs, DeltaManager, ReconnectMode } from "./deltaManager";
import { DeltaManagerProxy } from "./deltaManagerProxy";
import { Loader, RelativeLoader } from "./loader";
import { NullChaincode } from "./nullRuntime";
import { pkgVersion } from "./packageVersion";
import { PrefetchDocumentStorageService } from "./prefetchDocumentStorageService";
import { parseUrl } from "./utils";
import { BlobCacheStorageService } from "./blobCacheStorageService";

export { ErrorWithProps, CreateContainerError } from "@fluidframework/driver-utils";

// eslint-disable-next-line max-len
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-internal-modules
const merge = require("lodash/merge");

const PackageNotFactoryError = "Code package does not implement IRuntimeFactory";

export interface IContainerConfig {
    resolvedUrl?: IResolvedUrl;
    canReconnect?: boolean;
    originalRequest?: IRequest;
    id?: string;
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

export class Container extends EventEmitterWithErrorHandling<IContainerEvents> implements IContainer {
    public readonly isExperimentalContainer = true;
    public static version = "^0.1.0";

    /**
     * Load container.
     */
    public static async load(
        id: string,
        serviceFactory: IDocumentServiceFactory,
        codeLoader: ICodeLoader,
        options: any,
        scope: IComponent,
        loader: Loader,
        request: IRequest,
        resolvedUrl: IFluidResolvedUrl,
        urlResolver: IUrlResolver,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const [, docId] = id.split("/");
        const container = new Container(
            options,
            scope,
            codeLoader,
            loader,
            serviceFactory,
            urlResolver,
            {
                originalRequest: request,
                id: decodeURI(docId),
                resolvedUrl,
                canReconnect: !(request.headers?.[LoaderHeader.reconnect] === false),
            },
            logger);

        return new Promise<Container>((res, rej) => {
            const version = request.headers && request.headers[LoaderHeader.version];
            const pause = request.headers && request.headers[LoaderHeader.pause];

            const perfEvent = PerformanceEvent.start(container.logger, { eventName: "Load" });

            const onClosed = (err?: CriticalContainerError) => {
                // Depending where error happens, we can be attempting to connect to web socket
                // and continuously retrying (consider offline mode)
                // Host has no container to close, so it's prudent to do it here
                const error = err ?? CreateContainerError("Container closed without an error");
                container.close(error);
                rej(error);
            };
            container.on("closed", onClosed);

            container.load(version, !!pause)
                .finally(() => {
                    container.removeListener("closed", onClosed);
                })
                .then((props) => {
                    perfEvent.end(props);
                    res(container);
                },
                (error) => {
                    perfEvent.cancel(undefined, error);
                    const err = CreateContainerError(error);
                    onClosed(err);
                });
        });
    }

    public static async create(
        codeLoader: ICodeLoader,
        options: any,
        scope: IComponent,
        loader: Loader,
        source: IFluidCodeDetails,
        serviceFactory: IDocumentServiceFactory,
        urlResolver: IUrlResolver,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = new Container(
            options,
            scope,
            codeLoader,
            loader,
            serviceFactory,
            urlResolver,
            {},
            logger);
        await container.createDetached(source);

        return container;
    }

    public subLogger: TelemetryLogger;
    private _canReconnect: boolean = true;
    private readonly logger: ITelemetryLogger;

    private pendingClientId: string | undefined;
    private loaded = false;
    private attached = false;
    private blobManager: BlobManager | undefined;

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService | undefined | null;
    private blobsCacheStorageService: IDocumentStorageService | undefined;

    private _clientId: string | undefined;
    private _id: string | undefined;
    private originalRequest: IRequest | undefined;
    private readonly _deltaManager: DeltaManager;
    private _existing: boolean | undefined;
    private service: IDocumentService | undefined;
    private _parentBranch: string | null = null;
    private _connectionState = ConnectionState.Disconnected;
    private readonly _audience: Audience;

    private context: ContainerContext | undefined;
    private pkg: IFluidCodeDetails | undefined;
    private protocolHandler: ProtocolOpHandler | undefined;

    private resumedOpProcessingAfterLoad = false;
    private firstConnection = true;
    private manualReconnectInProgress = false;
    private readonly connectionTransitionTimes: number[] = [];
    private messageCountAfterDisconnection: number = 0;
    private _loadedFromVersion: IVersion | undefined;
    private _resolvedUrl: IResolvedUrl | undefined;

    private lastVisible: number | undefined;

    private _closed = false;

    public get resolvedUrl(): IResolvedUrl | undefined {
        return this._resolvedUrl;
    }

    public get loadedFromVersion(): IVersion | undefined {
        return this._loadedFromVersion;
    }

    /**
     * {@inheritDoc DeltaManager.readonly}
     */
    public get readonly() {
        return this._deltaManager.readonly;
    }

    /**
     * {@inheritDoc DeltaManager.readonlyPermissions}
     */
    public get readonlyPermissions() {
        return this._deltaManager.readonlyPermissions;
    }

    public forceReadonly(readonly: boolean) {
        this._deltaManager.forceReadonly(readonly);
    }

    public get closed(): boolean {
        return this._closed;
    }

    public get id(): string {
        return this._id ?? "";
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._deltaManager;
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get canReconnect(): boolean {
        return this._canReconnect;
    }

    /**
     * Service configuration details. If running in offline mode will be undefined otherwise will contain service
     * configuration details returned as part of the initial connection.
     */
    public get serviceConfiguration(): IServiceConfiguration | undefined {
        return this._deltaManager.serviceConfiguration;
    }

    /**
     * The server provided id of the client.
     * Set once this.connected is true, otherwise undefined
     */
    public get clientId(): string | undefined {
        return this._clientId;
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

    public get chaincodePackage(): IFluidCodeDetails | undefined {
        return this.pkg;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean | undefined {
        return this._existing;
    }

    /**
     * Retrieves the audience associated with the document
     */
    public get audience(): IAudience {
        return this._audience;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string | null {
        return this._parentBranch;
    }

    constructor(
        public readonly options: any,
        private readonly scope: IComponent,
        private readonly codeLoader: ICodeLoader,
        private readonly loader: Loader,
        private readonly serviceFactory: IDocumentServiceFactory,
        private readonly urlResolver: IUrlResolver,
        config: IContainerConfig,
        logger: ITelemetryBaseLogger | undefined,
    ) {
        super();
        this._audience = new Audience();

        // Initialize from config
        this.originalRequest = config.originalRequest;
        this._id = config.id;
        this._resolvedUrl = config.resolvedUrl;
        if (config.canReconnect !== undefined) {
            this._canReconnect = config.canReconnect;
        }

        // Create logger for components to use
        const type = this.client.details.type;
        const interactive = this.client.details.capabilities.interactive;
        const clientType = `${interactive ? "interactive" : "noninteractive"}${type ? `/${type}` : ""}`;
        // Need to use the property getter for docId because for detached flow we don't have the docId initially.
        // We assign the id later so property getter is used.
        this.subLogger = ChildLogger.create(
            logger,
            undefined,
            {
                clientType, // Differentiating summarizer container from main container
                loaderVersion: pkgVersion,
                containerId: uuid(),
            },
            {
                docId: () => this.id,
            });

        // Prefix all events in this file with container-loader
        this.logger = ChildLogger.create(this.subLogger, "Container");

        this._deltaManager = this.createDeltaManager();

        // keep track of last time page was visible for telemetry
        if (typeof document === "object" && document) {
            this.lastVisible = document.hidden ? performanceNow() : undefined;
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) {
                    this.lastVisible = performanceNow();
                } else {
                    // settimeout so this will hopefully fire after disconnect event if being hidden caused it
                    setTimeout(() => this.lastVisible = undefined, 0);
                }
            });
        }
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum {
        return this.protocolHandler!.quorum;
    }

    public close(error?: CriticalContainerError) {
        if (this._closed) {
            return;
        }
        this._closed = true;

        this._deltaManager.close(error);

        if (this.protocolHandler) {
            this.protocolHandler.close();
        }

        this.context?.dispose(error ? new Error(error.errorType.toString()) : undefined);

        assert(this.connectionState === ConnectionState.Disconnected, "disconnect event was not raised!");

        if (error !== undefined) {
            this.logger.sendErrorEvent(
                {
                    eventName: "ContainerClose",
                    // record sequence number for easier debugging
                    sequenceNumber: this._deltaManager.referenceSequenceNumber,
                },
                error,
            );
        } else {
            this.logger.sendTelemetryEvent({ eventName: "ContainerClose" });
        }

        this.emit("closed", error);

        this.removeAllListeners();
    }

    public isLocal(): boolean {
        return !this.attached;
    }

    public async attach(request: IRequest): Promise<void> {
        if (!this.context) {
            throw new Error("Context is undefined");
        }

        // Inbound queue for ops should be empty
        assert(!this.deltaManager.inbound.length);
        // Get the document state post attach - possibly can just call attach but we need to change the semantics
        // around what the attach means as far as async code goes.
        const appSummary: ISummaryTree = this.context.createSummary();
        if (!this.protocolHandler) {
            throw new Error("Protocol Handler is undefined");
        }
        const protocolSummary = this.protocolHandler.captureSummary();
        if (!request.headers?.[CreateNewHeader.createNew]) {
            request.headers = {
                ...request.headers,
                [CreateNewHeader.createNew]: {},
            };
        }
        const createNewResolvedUrl = await this.urlResolver.resolve(request);
        ensureFluidResolvedUrl(createNewResolvedUrl);

        try {
            // Actually go and create the resolved document
            this.service = await this.serviceFactory.createContainer(
                combineAppAndProtocolSummary(appSummary, protocolSummary),
                createNewResolvedUrl,
                this.subLogger,
            );
            const resolvedUrl = this.service.resolvedUrl;
            ensureFluidResolvedUrl(resolvedUrl);
            this._resolvedUrl = resolvedUrl;
            const url = await this.getAbsoluteUrl("");
            this.originalRequest = { url };
            this._canReconnect = !(request.headers?.[LoaderHeader.reconnect] === false);
            const parsedUrl = parseUrl(resolvedUrl.url);
            if (!parsedUrl) {
                throw new Error("Unable to parse Url");
            }
            const [, docId] = parsedUrl.id.split("/");
            this._id = decodeURI(docId);

            this.storageService = await this.getDocumentStorageService();

            // This we can probably just pass the storage service to the blob manager - although ideally
            // there just isn't a blob manager
            this.blobManager = await this.loadBlobManager(this.storageService, undefined);
            this.attached = true;

            // We know this is create new flow.
            this._existing = false;
            this._parentBranch = this._id;

            // Propagate current connection state through the system.
            const connected = this.connectionState === ConnectionState.Connected;
            assert(!connected || this._deltaManager.connectionMode === "read");
            this.propagateConnectionState();
            this.resumeInternal({ fetchOpsFromStorage: false, reason: "createDetached" });
        } catch (error) {
            this.close(CreateContainerError(error));
            throw error;
        }
    }

    public async request(path: IRequest): Promise<IResponse> {
        if (!path) {
            return { mimeType: "fluid/container", status: 200, value: this };
        }

        return this.context!.request(path);
    }

    public async snapshot(tagMessage: string, fullTree: boolean = false): Promise<void> {
        // TODO: Issue-2171 Support for Branch Snapshots
        if (tagMessage.includes("ReplayTool Snapshot") === false && this.parentBranch) {
            // The below debug ruins the chrome debugging session
            // Tracked (https://bugs.chromium.org/p/chromium/issues/detail?id=659515)
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        // Only snapshot once a code quorum has been established
        if (!this.protocolHandler!.quorum.has("code") && !this.protocolHandler!.quorum.has("code2")) {
            this.logger.sendTelemetryEvent({ eventName: "SkipSnapshot" });
            return;
        }

        // Stop inbound message processing while we complete the snapshot
        try {
            if (this.deltaManager !== undefined) {
                await this.deltaManager.inbound.systemPause();
            }

            await this.snapshotCore(tagMessage, fullTree);
        } catch (ex) {
            this.logger.logException({ eventName: "SnapshotExceptionError" }, ex);
            throw ex;
        } finally {
            if (this.deltaManager !== undefined) {
                this.deltaManager.inbound.systemResume();
            }
        }
    }

    public setAutoReconnect(reconnect: boolean) {
        assert(this.resumedOpProcessingAfterLoad);

        if (reconnect && this.closed) {
            throw new Error("Attempting to setAutoReconnect() a closed DeltaManager");
        }

        this._deltaManager.setAutomaticReconnect(reconnect);

        this.logger.sendTelemetryEvent({
            eventName: reconnect ? "AutoReconnectEnabled" : "AutoReconnectDisabled",
            connectionMode: this._deltaManager.connectionMode,
            connectionState: ConnectionState[this.connectionState],
        });

        if (reconnect) {
            if (this._connectionState === ConnectionState.Disconnected) {
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
        this.resumeInternal();
    }

    protected resumeInternal(args: IConnectionArgs = {}) {
        assert(this.loaded);

        if (this.closed) {
            throw new Error("Attempting to setAutoReconnect() a closed DeltaManager");
        }

        // Resume processing ops
        assert(!this.resumedOpProcessingAfterLoad);
        this.resumedOpProcessingAfterLoad = true;
        this._deltaManager.inbound.resume();
        this._deltaManager.outbound.resume();
        this._deltaManager.inboundSignal.resume();

        // Ensure connection to web socket
        // All errors are reported through events ("error" / "disconnected") and telemetry in DeltaManager
        this.connectToDeltaStream().catch(() => { });
    }

    public get storage(): IDocumentStorageService | null | undefined {
        return this.blobsCacheStorageService || this.storageService;
    }

    /**
     * Raise non-critical error to host. Calling this API will not close container.
     * For critical errors, please call Container.close(error).
     * @param error - an error to raise
     */
    public raiseContainerWarning(warning: ContainerWarning) {
        // Some "warning" events come from outside the container and are logged
        // elsewhere (e.g. summarizing container). We shouldn't log these here.
        if ((warning as any).logged !== true) {
            this.logContainerError(warning);
        }
        this.emit("warning", warning);
    }

    public async reloadContext(): Promise<void> {
        return this.reloadContextCore().catch((error) => {
            this.close(CreateContainerError(error));
            throw error;
        });
    }

    public hasNullRuntime() {
        return this.context!.hasNullRuntime();
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string> {
        if (this.resolvedUrl === undefined) {
            throw new Error("Container not attached to storage");
        }
        // TODO: Remove support for legacy requestUrl in 0.20
        const legacyResolver = this.urlResolver as {
            requestUrl?(resolvedUrl: IResolvedUrl, request: IRequest): Promise<IResponse>;

            getAbsoluteUrl?(
                resolvedUrl: IResolvedUrl,
                relativeUrl: string,
            ): Promise<string>;
        };

        if (legacyResolver.getAbsoluteUrl !== undefined) {
            return this.urlResolver.getAbsoluteUrl(
                this.resolvedUrl,
                relativeUrl);
        }

        if (legacyResolver.requestUrl !== undefined) {
            const response = await legacyResolver.requestUrl(
                this.resolvedUrl,
                { url: relativeUrl });

            if (response.status === 200) {
                return response.value as string;
            }
            throw new Error(response.value);
        }

        throw new Error("Url Resolver does not support creating urls");
    }

    private async reloadContextCore(): Promise<void> {
        await Promise.all([
            this.deltaManager.inbound.systemPause(),
            this.deltaManager.inboundSignal.systemPause()]);

        const previousContextState = await this.context!.snapshotRuntimeState();
        this.context!.dispose();

        let snapshot: ISnapshotTree | undefined;
        const blobs = new Map();
        if (previousContextState.snapshot) {
            snapshot = buildSnapshotTree(previousContextState.snapshot.entries, blobs);
        }

        if (blobs.size > 0) {
            this.blobsCacheStorageService = new BlobCacheStorageService(this.storageService!, blobs);
        }
        const attributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
            term: this._deltaManager.referenceTerm,
        };

        await this.loadContext(attributes, snapshot, previousContextState);

        this.deltaManager.inbound.systemResume();
        this.deltaManager.inboundSignal.systemResume();

        this._existing = true;
    }

    private async snapshotCore(tagMessage: string, fullTree: boolean = false) {
        // Snapshots base document state and currently running context
        const root = this.snapshotBase();
        const componentEntries = await this.context!.snapshot(tagMessage, fullTree);

        // And then combine
        if (componentEntries) {
            root.entries.push(...componentEntries.entries);
        }

        // Generate base snapshot message
        const deltaDetails =
            `${this._deltaManager.referenceSequenceNumber}:${this._deltaManager.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.getVersion(this.id);

        const parents = lastVersion ? [lastVersion.id] : [];

        // Write the full snapshot
        return this.storageService!.write(root, parents, message, "");
    }

    private snapshotBase(): ITree {
        const entries: ITreeEntry[] = [];

        const blobMetaData = this.blobManager!.getBlobMetadata();
        entries.push({
            mode: FileMode.File,
            path: ".blobs",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(blobMetaData),
                encoding: "utf-8",
            },
        });

        const quorumSnapshot = this.protocolHandler!.quorum.snapshot();
        entries.push({
            mode: FileMode.File,
            path: "quorumMembers",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(quorumSnapshot.members),
                encoding: "utf-8",
            },
        });
        entries.push({
            mode: FileMode.File,
            path: "quorumProposals",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(quorumSnapshot.proposals),
                encoding: "utf-8",
            },
        });
        entries.push({
            mode: FileMode.File,
            path: "quorumValues",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(quorumSnapshot.values),
                encoding: "utf-8",
            },
        });

        // Save attributes for the document
        const documentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
            term: this._deltaManager.referenceTerm,
        };
        entries.push({
            mode: FileMode.File,
            path: ".attributes",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(documentAttributes),
                encoding: "utf-8",
            },
        });

        // Output the tree
        const root: ITree = {
            entries,
            id: null,
        };

        return root;
    }

    private async getVersion(version: string): Promise<IVersion> {
        const versions = await this.storageService!.getVersions(version, 1);
        return versions[0];
    }

    private recordConnectStartTime() {
        if (this.connectionTransitionTimes[ConnectionState.Disconnected] === undefined) {
            this.connectionTransitionTimes[ConnectionState.Disconnected] = performanceNow();
        }
    }

    private async connectToDeltaStream(args: IConnectionArgs = {}) {
        this.recordConnectStartTime();

        // All agents need "write" access, including summarizer.
        if (!this.canReconnect || !this.client.details.capabilities.interactive) {
            args.mode = "write";
        }

        return this._deltaManager.connect(args);
    }

    /**
     * Load container.
     *
     * @param specifiedVersion - one of the following
     *   - null: use ops, no snapshots
     *   - undefined - fetch latest snapshot
     *   - otherwise, version sha to load snapshot
     * @param pause - start the container in a paused state
     */
    private async load(specifiedVersion: string | null | undefined, pause: boolean) {
        this.service = await this.serviceFactory.createDocumentService(this._resolvedUrl!, this.subLogger);

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
        const connectionArgs: IConnectionArgs = { mode: "write" };

        // Start websocket connection as soon as possible. Note that there is no op handler attached yet, but the
        // DeltaManager is resilient to this and will wait to start processing ops until after it is attached.
        if (!pause) {
            startConnectionP = this.connectToDeltaStream(connectionArgs);
            startConnectionP.catch((error) => { });
        }

        this.storageService = await this.getDocumentStorageService();
        this.attached = true;

        // Fetch specified snapshot, but intentionally do not load from snapshot if specifiedVersion is null
        const maybeSnapshotTree = specifiedVersion === null ? undefined
            : await this.fetchSnapshotTree(specifiedVersion);

        const blobManagerP = this.loadBlobManager(this.storageService, maybeSnapshotTree);

        const attributes = await this.getDocumentAttributes(this.storageService, maybeSnapshotTree);

        // Attach op handlers to start processing ops
        this.attachDeltaManagerOpHandler(attributes);

        // ...load in the existing quorum
        // Initialize the protocol handler
        const protocolHandlerP =
            this.loadAndInitializeProtocolState(attributes, this.storageService, maybeSnapshotTree);

        let loadDetailsP: Promise<void>;

        // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
        // the initial details
        if (maybeSnapshotTree) {
            this._existing = true;
            this._parentBranch = attributes.branch !== this.id ? attributes.branch : null;
            loadDetailsP = Promise.resolve();
        } else {
            if (!startConnectionP) {
                startConnectionP = this.connectToDeltaStream(connectionArgs);
            }
            // Intentionally don't .catch on this promise - we'll let any error throw below in the await.
            loadDetailsP = startConnectionP.then((details) => {
                this._existing = details.existing;
                this._parentBranch = details.parentBranch;
            });
        }

        // LoadContext directly requires blobManager and protocolHandler to be ready, and eventually calls
        // instantiateRuntime which will want to know existing state.  Wait for these promises to finish.
        [this.blobManager, this.protocolHandler] = await Promise.all([blobManagerP, protocolHandlerP, loadDetailsP]);

        await this.loadContext(attributes, maybeSnapshotTree);

        // Internal context is fully loaded at this point
        this.loaded = true;

        // Propagate current connection state through the system.
        const connected = this.connectionState === ConnectionState.Connected;
        assert(!connected || this._deltaManager.connectionMode === "read");
        this.propagateConnectionState();

        if (!pause) {
            this.resume();
        }

        return {
            existing: this._existing,
            sequenceNumber: attributes.sequenceNumber,
            version: maybeSnapshotTree && maybeSnapshotTree.id !== null ? maybeSnapshotTree.id : undefined,
        };
    }

    private async createDetached(source: IFluidCodeDetails) {
        const attributes: IDocumentAttributes = {
            branch: "",
            sequenceNumber: 0,
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
        this.protocolHandler = this.initializeProtocolState(
            attributes,
            members,
            proposals,
            values);

        // The load context - given we seeded the quorum - will be great
        await this.createDetachedContext(attributes);

        this.loaded = true;

        this.propagateConnectionState();
    }

    private async getDocumentStorageService(): Promise<IDocumentStorageService> {
        if (!this.service) {
            throw new Error("Not attached");
        }
        const storageService = await this.service.connectToStorage();
        return new PrefetchDocumentStorageService(storageService);
    }

    private async getDocumentAttributes(
        storage: IDocumentStorageService,
        tree: ISnapshotTree | undefined,
    ): Promise<IDocumentAttributes> {
        if (!tree) {
            return {
                branch: this.id,
                minimumSequenceNumber: 0,
                sequenceNumber: 0,
                term: 1,
            };
        }

        const attributesHash = ".protocol" in tree.trees
            ? tree.trees[".protocol"].blobs.attributes
            : tree.blobs[".attributes"];

        const attributes = await readAndParse<IDocumentAttributes>(storage, attributesHash);

        // Back-compat for older summaries with no term
        if (attributes.term === undefined) {
            attributes.term = 1;
        }

        return attributes;
    }

    private async loadAndInitializeProtocolState(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        snapshot: ISnapshotTree | undefined,
    ): Promise<ProtocolOpHandler> {
        let members: [string, ISequencedClient][] = [];
        let proposals: [number, ISequencedProposal, string[]][] = [];
        let values: [string, any][] = [];

        if (snapshot) {
            const baseTree = ".protocol" in snapshot.trees ? snapshot.trees[".protocol"] : snapshot;
            [members, proposals, values] = await Promise.all([
                readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers!),
                readAndParse<[number, ISequencedProposal, string[]][]>(storage, baseTree.blobs.quorumProposals!),
                readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues!),
            ]);
        }

        const protocolHandler = this.initializeProtocolState(
            attributes,
            members,
            proposals,
            values);

        return protocolHandler;
    }

    private initializeProtocolState(
        attributes: IDocumentAttributes,
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, any][],
    ): ProtocolOpHandler {
        const protocol = new ProtocolOpHandler(
            attributes.branch,
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
            // This is the only one that requires the pending client ID
            if (clientId === this.pendingClientId) {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined @ ${details.sequenceNumber}`);
            }
        });

        protocol.quorum.on("removeMember", (clientId) => {
            if (clientId === this._clientId) {
                this._deltaManager.updateQuorumLeave();
            }
        });

        protocol.quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                debug(`approved ${key}`);
                if (key === "code" || key === "code2") {
                    debug(`loadRuntimeFactory ${JSON.stringify(value)}`);

                    if (value === this.pkg) {
                        return;
                    }

                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this.reloadContext();
                }
            });

        return protocol;
    }

    private async loadBlobManager(
        storage: IDocumentStorageService,
        tree: ISnapshotTree | undefined,
    ): Promise<BlobManager> {
        const blobHash = tree && tree.blobs[".blobs"];
        const blobs: IGenericBlob[] = blobHash
            ? await readAndParse<IGenericBlob[]>(storage, blobHash)
            : [];

        const blobManager = new BlobManager(storage);
        blobManager.loadBlobMetadata(blobs);

        return blobManager;
    }

    private getCodeDetailsFromQuorum(): IFluidCodeDetails | undefined {
        const quorum = this.protocolHandler!.quorum;

        let pkg = quorum.get("code");

        // Back compat
        if (!pkg) {
            pkg = quorum.get("code2");
        }

        return pkg;
    }

    /**
     * Loads the runtime factory for the provided package
     */
    private async loadRuntimeFactory(pkg: IFluidCodeDetails): Promise<IRuntimeFactory> {
        let component: IFluidModule;
        const perfEvent = PerformanceEvent.start(this.logger, { eventName: "CodeLoad" });
        try {
            component = await this.codeLoader.load(pkg);
        } catch (error) {
            perfEvent.cancel({}, error);
            throw error;
        }
        perfEvent.end();

        const factory = component.fluidExport.IRuntimeFactory;
        if (!factory) {
            throw new Error(PackageNotFactoryError);
        }
        return factory;
    }

    private get client(): IClient {
        const client: IClient = this.options && this.options.client
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

        // Client info from headers overrides client info from loader options
        const headerClientDetails = this.originalRequest?.headers?.[LoaderHeader.clientDetails];

        if (headerClientDetails) {
            merge(client.details, headerClientDetails);
        }

        return client;
    }

    private createDeltaManager() {
        const deltaManager = new DeltaManager(
            () => this.service,
            this.client,
            ChildLogger.create(this.subLogger, "DeltaManager"),
            this.canReconnect,
        );

        deltaManager.on("connect", (details: IConnectionDetails) => {
            const oldState = this._connectionState;
            this._connectionState = ConnectionState.Connecting;

            // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
            // (have received the join message for the client ID)
            // This is especially important in the reconnect case. It's possible there could be outstanding
            // ops sent by this client, so we should keep the old client id until we see our own client's
            // join message. after we see the join message for out new connection with our new client id,
            // we know there can no longer be outstanding ops that we sent with the previous client id.
            this.pendingClientId = details.clientId;

            this.emit("joining");

            // Report telemetry after we set client id!
            this.logConnectionStateChangeTelemetry(ConnectionState.Connecting, oldState, "websocket established");

            if (deltaManager.connectionMode === "read") {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined as readonly`);
            }

            // Back-compat for new client and old server.
            this._audience.clear();

            for (const priorClient of details.initialClients ?? []) {
                this._audience.addMember(priorClient.clientId, priorClient.client);
            }
        });

        deltaManager.on("disconnect", (reason: string) => {
            this.manualReconnectInProgress = false;
            this.setConnectionState(ConnectionState.Disconnected, reason);
        });

        deltaManager.on("throttled", (warning: IThrottlingWarning) => {
            this.raiseContainerWarning(warning);
        });

        deltaManager.on("pong", (latency) => {
            this.emit("pong", latency);
        });

        deltaManager.on("processTime", (time) => {
            this.emit("processTime", time);
        });

        deltaManager.on("readonly", (readonly) => {
            this.emit("readonly", readonly);
        });

        return deltaManager;
    }

    private attachDeltaManagerOpHandler(attributes: IDocumentAttributes): void {
        this._deltaManager.on("closed", (error?: CriticalContainerError) => {
            this.close(error);
        });

        // If we're the outer frame, do we want to do this?
        // Begin fetching any pending deltas once we know the base sequence #. Can this fail?
        // It seems like something, like reconnection, that we would want to retry but otherwise allow
        // the document to load
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

    private logConnectionStateChangeTelemetry(value: ConnectionState, oldState: ConnectionState, reason: string) {
        // Log actual event
        const time = performanceNow();
        this.connectionTransitionTimes[value] = time;
        const duration = time - this.connectionTransitionTimes[oldState];

        let durationFromDisconnected: number | undefined;
        let connectionMode: string | undefined;
        let connectionInitiationReason: string | undefined;
        let autoReconnect: ReconnectMode | undefined;
        if (value === ConnectionState.Disconnected) {
            autoReconnect = this._deltaManager.reconnectMode;
        } else {
            connectionMode = this._deltaManager.connectionMode;
            if (value === ConnectionState.Connected) {
                durationFromDisconnected = time - this.connectionTransitionTimes[ConnectionState.Disconnected];
                durationFromDisconnected = TelemetryLogger.formatTick(durationFromDisconnected);
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
            pendingClientId: this.pendingClientId,
            clientId: this.clientId,
            connectionMode,
            autoReconnect,
            online: OnlineStatus[isOnline()],
            lastVisible: this.lastVisible ? performanceNow() - this.lastVisible : undefined,
        });

        if (value === ConnectionState.Connected) {
            this.firstConnection = false;
            this.manualReconnectInProgress = false;
        }
    }

    private setConnectionState(
        value: ConnectionState,
        reason: string) {
        assert(value !== ConnectionState.Connecting);
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            this.logger.sendErrorEvent({ eventName: "setConnectionStateSame", value });
            return;
        }

        const oldState = this._connectionState;
        this._connectionState = value;

        if (value === ConnectionState.Connected) {
            this._clientId = this.pendingClientId;
            this._deltaManager.updateQuorumJoin();
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this.pendingClientId = undefined;
        }

        if (this.loaded) {
            this.propagateConnectionState();
        }

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(value, oldState, reason);
    }

    private propagateConnectionState() {
        assert(this.loaded);
        const logOpsOnReconnect: boolean =
            this._connectionState === ConnectionState.Connected &&
            !this.firstConnection &&
            this._deltaManager.connectionMode === "write";
        if (logOpsOnReconnect) {
            this.messageCountAfterDisconnection = 0;
        }

        const state = this._connectionState === ConnectionState.Connected;
        this.context!.setConnectionState(state, this.clientId);
        this.protocolHandler!.quorum.setConnectionState(state, this.clientId);
        raiseConnectedEvent(this.logger, this, state, this.clientId);

        if (logOpsOnReconnect) {
            this.logger.sendTelemetryEvent(
                { eventName: "OpsSentOnReconnect", count: this.messageCountAfterDisconnection });
        }
    }

    private submitMessage(type: MessageType, contents: any, batch?: boolean, metadata?: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            this.logger.sendErrorEvent({ eventName: "SubmitMessageWithNoConnection", type });
            return -1;
        }

        this.messageCountAfterDisconnection += 1;
        return this._deltaManager.submit(type, contents, batch, metadata);
    }

    private processRemoteMessage(message: ISequencedDocumentMessage): IProcessMessageResult {
        const local = this._clientId === message.clientId;

        // Forward non system messages to the loaded runtime for processing
        if (!isSystemMessage(message)) {
            this.context!.process(message, local, undefined);
        }

        // Allow the protocol handler to process the message
        const result = this.protocolHandler!.processMessage(message, local);

        this.emit("op", message);

        return result;
    }

    private submitSignal(message: any) {
        this._deltaManager.submitSignal(JSON.stringify(message));
    }

    private processSignal(message: ISignalMessage) {
        // No clientId indicates a system signal message.
        if (message.clientId === null && this._audience) {
            const innerContent = message.content as { content: any; type: string };
            if (innerContent.type === MessageType.ClientJoin) {
                const newClient = innerContent.content as ISignalClient;
                this._audience.addMember(newClient.clientId, newClient.client);
            } else if (innerContent.type === MessageType.ClientLeave) {
                const leftClientId = innerContent.content as string;
                this._audience.removeMember(leftClientId);
            }
        } else {
            const local = this._clientId === message.clientId;
            this.context!.processSignal(message, local);
        }
    }

    /**
     * Get the most recent snapshot, or a specific version.
     * @param specifiedVersion - The specific version of the snapshot to retrieve
     * @returns The snapshot requested, or the latest snapshot if no version was specified
     */
    private async fetchSnapshotTree(specifiedVersion?: string): Promise<ISnapshotTree | undefined> {
        const version = await this.getVersion(specifiedVersion || this.id);

        if (version) {
            this._loadedFromVersion = version;
            return await this.storageService!.getSnapshotTree(version) || undefined;
        } else if (specifiedVersion) {
            // We should have a defined version to load from if specified version requested
            this.logger.sendErrorEvent({ eventName: "NoVersionFoundWhenSpecified", specifiedVersion });
        }

        return undefined;
    }

    private async loadContext(
        attributes: IDocumentAttributes,
        snapshot?: ISnapshotTree,
        previousRuntimeState: IRuntimeState = {},
    ) {
        this.pkg = this.getCodeDetailsFromQuorum();
        const chaincode = this.pkg ? await this.loadRuntimeFactory(this.pkg) : new NullChaincode();

        // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
        // are set. Global requests will still go to this loader
        const loader = new RelativeLoader(this.loader, () => this.originalRequest);

        this.context = await ContainerContext.createOrLoad(
            this,
            this.scope,
            this.codeLoader,
            chaincode,
            snapshot ?? null,
            attributes,
            this.blobManager,
            new DeltaManagerProxy(this._deltaManager),
            new QuorumProxy(this.protocolHandler!.quorum),
            loader,
            (warning: ContainerWarning) => this.raiseContainerWarning(warning),
            (type, contents, batch, metadata) => this.submitMessage(type, contents, batch, metadata),
            (message) => this.submitSignal(message),
            async (message) => this.snapshot(message),
            (error?: CriticalContainerError) => this.close(error),
            Container.version,
            previousRuntimeState,
        );

        loader.resolveContainer(this);
        this.emit("contextChanged", this.pkg);
    }

    /**
     * Creates a new, unattached container context
     */
    private async createDetachedContext(attributes: IDocumentAttributes) {
        this.pkg = this.getCodeDetailsFromQuorum();
        if (!this.pkg) {
            throw new Error("pkg should be provided in create flow!!");
        }
        const runtimeFactory = await this.loadRuntimeFactory(this.pkg);

        // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
        // are set. Global requests will still go to this loader
        const loader = new RelativeLoader(this.loader, () => this.originalRequest);

        this.context = await ContainerContext.createOrLoad(
            this,
            this.scope,
            this.codeLoader,
            runtimeFactory,
            { id: null, blobs: {}, commits: {}, trees: {} },    // TODO this will be from the offline store
            attributes,
            this.blobManager,
            new DeltaManagerProxy(this._deltaManager),
            new QuorumProxy(this.protocolHandler!.quorum),
            loader,
            (warning: ContainerWarning) => this.raiseContainerWarning(warning),
            (type, contents, batch, metadata) => this.submitMessage(type, contents, batch, metadata),
            (message) => this.submitSignal(message),
            async (message) => this.snapshot(message),
            (error?: CriticalContainerError) => this.close(error),
            Container.version,
            {},
        );

        loader.resolveContainer(this);
        this.emit("contextChanged", this.pkg);
    }

    // Please avoid calling it directly.
    // raiseContainerWarning() is the right flow for most cases
    private logContainerError(warning: ContainerWarning) {
        this.logger.sendErrorEvent({ eventName: "ContainerWarning" }, warning);
    }
}
