/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Disabling these per-file rather than full subdirectory
/* eslint-disable @typescript-eslint/no-misused-promises */

import * as assert from "assert";
import {
    ITelemetryBaseLogger,
    ITelemetryLogger,
    TelemetryEventRaisedOnContainer,
} from "@microsoft/fluid-common-definitions";
import { IComponent, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    IConnectionDetails,
    IContainer,
    IDeltaManager,
    IFluidCodeDetails,
    IFluidModule,
    IGenericBlob,
    IRuntimeFactory,
    LoaderHeader,
} from "@microsoft/fluid-container-definitions";
import {
    ChildLogger,
    DebugLogger,
    EventEmitterWithErrorHandling,
    PerformanceEvent,
    TelemetryLogger,
} from "@microsoft/fluid-core-utils";
import {
    IDocumentService,
    IDocumentStorageService,
} from "@microsoft/fluid-driver-definitions";
import { readAndParse } from "@microsoft/fluid-driver-utils";
import {
    buildSnapshotTree,
    isSystemMessage,
    ProtocolOpHandler,
    Quorum,
    QuorumProxy,
    raiseConnectedEvent,
} from "@microsoft/fluid-protocol-base";
import {
    ConnectionState,
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
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ITokenClaims,
    ITree,
    ITreeEntry,
    IVersion,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import * as jwtDecode from "jwt-decode";
import { Audience } from "./audience";
import { BlobCacheStorageService } from "./blobCacheStorageService";
import { BlobManager } from "./blobManager";
import { ContainerContext } from "./containerContext";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";
import { DeltaManagerProxy } from "./deltaManagerProxy";
import { Loader, RelativeLoader } from "./loader";
import { NullChaincode } from "./nullRuntime";
import { pkgName, pkgVersion } from "./packageVersion";
import { PrefetchDocumentStorageService } from "./prefetchDocumentStorageService";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const performanceNow = require("performance-now") as (() => number);
// eslint-disable-next-line max-len
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-internal-modules
const merge = require("lodash/merge");

const PackageNotFactoryError = "Code package does not implement IRuntimeFactory";

export class Container extends EventEmitterWithErrorHandling implements IContainer {
    public static version = "^0.1.0";

    /**
     * Load container.
     */
    public static async load(
        id: string,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        options: any,
        scope: IComponent,
        loader: Loader,
        request: IRequest,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = new Container(
            id,
            options,
            service,
            scope,
            codeLoader,
            loader,
            request,
            logger);

        // eslint-disable-next-line no-async-promise-executor
        return new Promise<Container>(async (res, rej) => {
            let alreadyRaisedError = false;
            const onError = (error) => {
                container.removeListener("error", onError);
                // Depending where error happens, we can be attempting to connect to web socket
                // and continuously retrying (consider offline mode)
                // Host has no container to close, so it's prudent to do it here
                container.close();
                rej(error);
                alreadyRaisedError = true;
            };
            container.on("error", onError);

            const version = request.headers && request.headers[LoaderHeader.version];
            const pause = request.headers && request.headers[LoaderHeader.pause];

            // tslint:disable-next-line no-unsafe-any
            return container.load(version, !!pause)
                .then(() => {
                    container.removeListener("error", onError);
                    res(container);
                })
                .catch((error) => {
                    if (!alreadyRaisedError) {
                        container.logCriticalError(error);
                    }
                    onError(error);
                });
        });
    }

    public subLogger: TelemetryLogger;
    public readonly canReconnect: boolean;
    private readonly logger: ITelemetryLogger;

    private pendingClientId: string | undefined;
    private loaded = false;
    // TSLint incorrectly believes blobManager is not reassigned, but actually it is in load().
    // Known bug: https://github.com/palantir/tslint/issues/3803
    // Fixed in ESLint: https://github.com/typescript-eslint/typescript-eslint/issues/946
    // tslint:disable-next-line:prefer-readonly
    private blobManager: BlobManager | undefined;

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService | undefined | null;

    private _version: string | undefined;
    private _clientId: string | undefined;
    private _scopes: string[] | undefined;
    private readonly _deltaManager: DeltaManager;
    private _existing: boolean | undefined;
    private readonly _id: string;
    private _parentBranch: string | undefined | null;
    private _connectionState = ConnectionState.Disconnected;
    private _serviceConfiguration: IServiceConfiguration | undefined;
    private readonly _audience: Audience;

    private context: ContainerContext | undefined;
    private pkg: string | IFluidCodeDetails | undefined;
    private codeQuorumKey;
    // TSLint incorrectly believes protocolHandler is not reassigned, but actually it is in load().
    // Known bug: https://github.com/palantir/tslint/issues/3803
    // Fixed in ESLint: https://github.com/typescript-eslint/typescript-eslint/issues/946
    // tslint:disable-next-line:prefer-readonly
    private protocolHandler: ProtocolOpHandler | undefined;

    private firstConnection = true;
    private manualReconnectInProgress = false;
    private readonly connectionTransitionTimes: number[] = [];
    private messageCountAfterDisconnection: number = 0;

    private _closed = false;

    public get closed(): boolean {
        return this._closed;
    }

    public get id(): string {
        return this._id;
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

    /**
     * Service configuration details. If running in offline mode will be undefined otherwise will contain service
     * configuration details returned as part of the initial connection.
     */
    public get serviceConfiguration(): IServiceConfiguration | undefined {
        return this._serviceConfiguration;
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
        return this._scopes;
    }

    /**
     * DEPRECATED: use clientDetails.type instead
     * back-compat: 0.11 clientType
     */
    public get clientType(): string {
        return this._deltaManager.clientType;
    }

    public get clientDetails(): IClientDetails {
        return this._deltaManager.clientDetails;
    }

    public get chaincodePackage(): string | IFluidCodeDetails | undefined {
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
    public get audience(): Audience {
        return this._audience;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string | undefined | null {
        return this._parentBranch;
    }

    /**
     * Controls whether the container will automatically reconnect to the delta stream after receiving a disconnect.
     */
    public set autoReconnect(value: boolean) {
        this.logger.sendTelemetryEvent({
            eventName: "AutoReconnect",
            value,
            connectionMode: this._deltaManager.connectionMode,
            connectionState: ConnectionState[this.connectionState],
        });

        this._deltaManager.autoReconnect = value;
    }

    /**
     * Controls whether the container will automatically reconnect to the delta stream after receiving a disconnect.
     */
    public get autoReconnect() {
        return this._deltaManager.autoReconnect;
    }

    constructor(
        id: string,
        public readonly options: any,
        private readonly service: IDocumentService,
        private readonly scope: IComponent,
        private readonly codeLoader: ICodeLoader,
        private readonly loader: Loader,
        private readonly originalRequest: IRequest,
        logger?: ITelemetryBaseLogger,
    ) {
        super();

        const [, docId] = id.split("/");
        this._id = decodeURI(docId);
        this._scopes = this.getScopes(options);
        this._audience = new Audience();
        this.canReconnect = !(originalRequest.headers && originalRequest.headers[LoaderHeader.reconnect] === false);

        // Create logger for components to use
        // back-compat: 0.11 clientType
        const clientType = this.client.details ? this.client.details.type : this.client.type;
        this.subLogger = DebugLogger.mixinDebugLogger(
            "fluid:telemetry",
            logger,
            {
                docId: this.id,
                clientType, // Differentiating summarizer container from main container
                packageName: TelemetryLogger.sanitizePkgName(pkgName),
                packageVersion: pkgVersion,
            });

        // Prefix all events in this file with container-loader
        this.logger = ChildLogger.create(this.subLogger, "Container");

        this.on("error", (error: any) => {
            this.logCriticalError(error);
        });

        this._deltaManager = this.createDeltaManager();
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum {
        return this.protocolHandler!.quorum;
    }

    public on(event: "connected" | "contextChanged", listener: (clientId: string) => void): this;
    public on(event: "disconnected" | "joining" | "closed", listener: () => void): this;
    public on(event: "error", listener: (error: any) => void): this;
    public on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    public on(event: "pong" | "processTime", listener: (latency: number) => void): this;
    public on(event: MessageType.BlobUploaded, listener: (contents: any) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public close(reason?: string) {
        if (this._closed) {
            return;
        }
        this._closed = true;

        this._deltaManager.close(reason ? new Error(reason) : undefined, false /*raiseContainerError*/);

        if (this.protocolHandler) {
            this.protocolHandler.close();
        }

        assert(this.connectionState === ConnectionState.Disconnected, "disconnect event was not raised!");

        this.emit("closed");

        this.removeAllListeners();
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

    public resume() {
        assert(this.loaded);
        // Resume processing ops
        this._deltaManager.inbound.resume();
        this._deltaManager.outbound.resume();
        this._deltaManager.inboundSignal.resume();

        // Ensure connection to web socket
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connectToDeltaStream();
    }

    public raiseCriticalError(error: any) {
        this.emit("error", error);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public reloadContext(): Promise<void> {
        return this.reloadContextCore().catch((error) => {
            this.raiseCriticalError(error);
            throw error;
        });
    }

    /**
     * Connect the deltaManager.  Useful when the autoConnect flag is set to false.
     */
    public async reconnect() {
        // Only track this as a manual reconnection if we are truly the ones kicking it off.
        if (this._connectionState === ConnectionState.Disconnected) {
            this.manualReconnectInProgress = true;
        }
        return this._deltaManager.connect().catch(() => { });
    }

    private async reloadContextCore(): Promise<void> {
        await Promise.all([
            this.deltaManager.inbound.systemPause(),
            this.deltaManager.inboundSignal.systemPause()]);

        const previousContextState = await this.context!.stop();

        let snapshot: ISnapshotTree | undefined;
        const blobs = new Map();
        if (previousContextState) {
            snapshot = buildSnapshotTree(previousContextState.entries, blobs);
        }

        const storage = blobs.size > 0
            ? new BlobCacheStorageService(this.storageService!, blobs)
            : this.storageService!;

        const attributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
        };

        await this.loadContext(attributes, storage, snapshot);

        this.deltaManager.inbound.systemResume();
        this.deltaManager.inboundSignal.systemResume();
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
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
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

    private startConnectingToDeltaStream() {
        this.recordConnectStartTime();
        this._deltaManager.connect().catch(() => { });
    }

    private async connectToDeltaStream() {
        this.recordConnectStartTime();
        return this._deltaManager.connect();
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
    private async load(specifiedVersion: string | null | undefined, pause: boolean): Promise<void> {
        const perfEvent = PerformanceEvent.start(this.logger, { eventName: "Load" });

        // Start websocket connection as soon as possible.  Note that there is no op handler attached yet, but the
        // DeltaManager is resilient to this and will wait to start processing ops until after it is attached.
        if (!pause) {
            this.startConnectingToDeltaStream();
        }

        this.storageService = await this.getDocumentStorageService();

        // Fetch specified snapshot, but intentionally do not load from snapshot if specifiedVersion is null
        const maybeSnapshotTree = specifiedVersion === null ? undefined
            : await this.fetchSnapshotTree(specifiedVersion);

        // If pause, and there's no tree, then we'll start the websocket connection here (we'll need the details later)
        if (!maybeSnapshotTree) {
            this.startConnectingToDeltaStream();
        }

        const blobManagerP = this.loadBlobManager(this.storageService, maybeSnapshotTree);

        const attributes = await this.getDocumentAttributes(this.storageService, maybeSnapshotTree);

        // Attach op handlers to start processing ops
        this.attachDeltaManagerOpHandler(attributes, !specifiedVersion);

        // ...load in the existing quorum
        // Initialize the protocol handler
        const protocolHandlerP = this.initializeProtocolState(attributes, this.storageService, maybeSnapshotTree);

        let loadDetailsP: Promise<void>;

        // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
        // the initial details
        if (maybeSnapshotTree) {
            this._existing = true;
            this._parentBranch = attributes.branch !== this.id ? attributes.branch : null;
            loadDetailsP = Promise.resolve();
        } else {
            loadDetailsP = this.connectToDeltaStream().then((details) => {
                this._existing = details.existing;
                this._parentBranch = details.parentBranch;
            });
        }

        // LoadContext directly requires blobManager and protocolHandler to be ready, and eventually calls
        // instantiateRuntime which will want to know existing state.  Wait for these promises to finish.
        [this.blobManager, this.protocolHandler] = await Promise.all([blobManagerP, protocolHandlerP, loadDetailsP]);

        await this.loadContext(attributes, this.storageService, maybeSnapshotTree);

        this.context!.changeConnectionState(this.connectionState, this.clientId!, this._version);

        // Internal context is fully loaded at this point
        this.loaded = true;

        // Propagate current connection state through the system.
        const connected = this.connectionState === ConnectionState.Connected;
        assert(!connected || this._deltaManager.connectionMode === "read");
        this.propagateConnectionState();

        perfEvent.end({
            existing: this._existing,
            sequenceNumber: attributes.sequenceNumber,
            version: maybeSnapshotTree ? maybeSnapshotTree.id : undefined,
        });

        if (!pause) {
            this.resume();
        }
    }

    private async getDocumentStorageService(): Promise<IDocumentStorageService> {
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
            };
        }

        const attributesHash = ".protocol" in tree.trees
            ? tree.trees[".protocol"].blobs.attributes
            : tree.blobs[".attributes"];

        return readAndParse<IDocumentAttributes>(storage, attributesHash);
    }

    private async initializeProtocolState(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree | undefined,
    ): Promise<ProtocolOpHandler> {
        let members: [string, ISequencedClient][] = [];
        let proposals: [number, ISequencedProposal, string[]][] = [];
        let values: [string, any][] = [];

        if (tree) {
            const baseTree = ".protocol" in tree.trees ? tree.trees[".protocol"] : tree;
            [members, proposals, values] = await Promise.all([
                readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers!),
                readAndParse<[number, ISequencedProposal, string[]][]>(storage, baseTree.blobs.quorumProposals!),
                readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues!),
            ]);
        }

        const protocol = new ProtocolOpHandler(
            attributes.branch,
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            members,
            proposals,
            values,
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            (sequenceNumber) => this.submitMessage(MessageType.Reject, sequenceNumber));

        const protocolLogger = ChildLogger.create(this.subLogger, "ProtocolHandler");

        protocol.on("Summary", (message) => {
            /* eslint-disable @typescript-eslint/indent */
            switch (message.type) {
                case MessageType.Summarize:
                    protocolLogger.sendTelemetryEvent({
                        eventName: "Summarize",
                        message: message.contents as ISummaryContent,
                        summarySequenceNumber: message.sequenceNumber,
                        refSequenceNumber: message.referenceSequenceNumber,
                    });
                    break;
                case MessageType.SummaryAck:
                    const ack = message.contents as ISummaryAck;
                    protocolLogger.sendTelemetryEvent({
                        eventName: "SummaryAck",
                        handle: ack.handle,
                        sequenceNumber: message.sequenceNumber,
                        summarySequenceNumber: ack.summaryProposal.summarySequenceNumber,
                    });
                    break;
                case MessageType.SummaryNack:
                    const nack = message.contents as ISummaryNack;
                    protocolLogger.sendTelemetryEvent({
                        eventName: "SummaryNack",
                        error: nack.errorMessage,
                        sequenceNumber: message.sequenceNumber,
                        summarySequenceNumber: nack.summaryProposal.summarySequenceNumber,
                    });
                    break;
                default:
            }
            /* eslint-enable @typescript-eslint/indent */
        });

        protocol.quorum.on("error", (error) => {
            // tslint:disable-next-line no-unsafe-any
            protocolLogger.sendErrorEvent(error);
        });

        // Track membership changes and update connection state accordingly
        protocol.quorum.on("addMember", (clientId, details) => {
            // This is the only one that requires the pending client ID
            if (clientId === this.pendingClientId) {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined @ ${details.sequenceNumber}`,
                    this.pendingClientId,
                    this._deltaManager.version,
                    details.client.scopes,
                    this._deltaManager.serviceConfiguration);
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
                    // Back compat - can remove in 0.7
                    if (!this.codeQuorumKey) {
                        this.codeQuorumKey = key;
                    }

                    // Back compat - can remove in 0.7
                    if (key !== this.codeQuorumKey) {
                        return;
                    }

                    debug(`loadCode ${JSON.stringify(value)}`);

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

    private async loadCodeFromQuorum(
        quorum: Quorum,
    ): Promise<{ pkg: IFluidCodeDetails | undefined; chaincode: IRuntimeFactory }> {
        // Back compat - can remove in 0.7
        const codeQuorumKey = quorum.has("code")
            ? "code"
            : quorum.has("code2") ? "code2" : undefined;
        this.codeQuorumKey = codeQuorumKey;

        const pkg = codeQuorumKey ? quorum.get(codeQuorumKey) as IFluidCodeDetails : undefined;
        const chaincode = await this.loadCode(pkg);

        return { chaincode, pkg };
    }

    /**
     * Loads the code for the provided package
     */
    private async loadCode(pkg: IFluidCodeDetails | undefined): Promise<IRuntimeFactory> {
        if (!pkg) {
            return new NullChaincode();
        }

        const component = await this.codeLoader.load<IRuntimeFactory | IFluidModule>(pkg);

        if ("fluidExport" in component) {
            const factory = component.fluidExport.IRuntimeFactory;
            return factory ? factory : Promise.reject(PackageNotFactoryError);
        }

        // TODO included for back-compat
        if ("instantiateRuntime" in component) {
            return component;
        }

        return Promise.reject(PackageNotFactoryError);
    }

    private get client() {
        // tslint:disable-next-line:no-unsafe-any
        const client: IClient = this.options && this.options.client
            // tslint:disable-next-line:no-unsafe-any
            ? (this.options.client as IClient)
            : {
                type: "browser", // Back-compat: 0.11 clientType
                details: {
                    capabilities: { interactive: true },
                },
                permission: [],
                scopes: [],
                user: { id: "" },
            };

        // Client info from headers overrides client info from loader options
        const headerClientDetails = this.originalRequest.headers
            && this.originalRequest.headers[LoaderHeader.clientDetails];

        if (headerClientDetails) {
            // tslint:disable-next-line: no-unsafe-any
            merge(client.details, headerClientDetails);
        }

        // Back-compat: 0.11 clientType
        const headerClientType = this.originalRequest.headers && this.originalRequest.headers[LoaderHeader.clientType];
        if (headerClientType) {
            client.type = headerClientType;
        }
        return client;
    }

    private createDeltaManager() {
        const deltaManager = new DeltaManager(
            this.service,
            this.client,
            ChildLogger.create(this.subLogger, "DeltaManager"),
            this.canReconnect,
        );

        deltaManager.on("connect", (details: IConnectionDetails) => {
            this.setConnectionState(
                ConnectionState.Connecting,
                "websocket established",
                details.clientId,
                details.version,
                details.claims.scopes,
                details.serviceConfiguration);

            if (deltaManager.connectionMode === "read") {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined as readonly`,
                    details.clientId,
                    deltaManager.version,
                    details.claims.scopes,
                    deltaManager.serviceConfiguration);
            }

            // Back-compat for new client and old server.
            this._audience.clear();

            const priorClients = details.initialClients ? details.initialClients : [];
            for (const priorClient of priorClients) {
                this._audience.addMember(priorClient.clientId, priorClient.client);
            }
        });

        deltaManager.on("disconnect", (reason: string) => {
            this.manualReconnectInProgress = false;
            this.setConnectionState(ConnectionState.Disconnected, reason);
        });

        deltaManager.on("error", (error) => {
            this.raiseCriticalError(error);
        });

        deltaManager.on("pong", (latency) => {
            this.emit("pong", latency);
        });

        deltaManager.on("processTime", (time) => {
            this.emit("processTime", time);
        });

        return deltaManager;
    }

    private attachDeltaManagerOpHandler(attributes: IDocumentAttributes, catchUp: boolean): void {
        this._deltaManager.on("closed", () => {
            this.close();
        });

        // If we're the outer frame, do we want to do this?
        // Begin fetching any pending deltas once we know the base sequence #. Can this fail?
        // It seems like something, like reconnection, that we would want to retry but otherwise allow
        // the document to load
        this._deltaManager.attachOpHandler(
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            {
                process: (message) => this.processRemoteMessage(message),
                processSignal: (message) => {
                    this.processSignal(message);
                },
            },
            catchUp);
    }

    private logConnectionStateChangeTelemetry(value: ConnectionState, oldState: ConnectionState, reason: string) {
        // Log actual event
        const time = performanceNow();
        this.connectionTransitionTimes[value] = time;
        const duration = time - this.connectionTransitionTimes[oldState];

        let durationFromDisconnected: number | undefined;
        let connectionMode: string | undefined;
        let connectionInitiationReason: string | undefined;
        let autoReconnect: boolean | undefined;
        if (value === ConnectionState.Disconnected) {
            autoReconnect = this._deltaManager.autoReconnect;
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
        });

        if (value === ConnectionState.Connected) {
            this.firstConnection = false;
            this.manualReconnectInProgress = false;
        }
    }

    private setConnectionState(value: ConnectionState.Disconnected, reason: string);
    private setConnectionState(
        value: ConnectionState,
        reason: string,
        clientId: string,
        version: string,
        scopes: string[],
        configuration: IServiceConfiguration);
    private setConnectionState(
        value: ConnectionState,
        reason: string,
        context?: string,
        version?: string,
        scopes?: string[],
        configuration?: IServiceConfiguration) {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            this.logger.sendErrorEvent({ eventName: "setConnectionStateSame", value });
            return;
        }

        const oldState = this._connectionState;
        this._connectionState = value;
        this._version = version;
        this._scopes = scopes;
        this._serviceConfiguration = configuration;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        // This is especially important in the reconnect case. It's possible there could be outstanding
        // ops sent by this client, so we should keep the old client id until we see our own client's
        // join message. after we see the join message for out new connection with our new client id,
        // we know there can no longer be outstanding ops that we sent with the previous client id.
        if (value === ConnectionState.Connecting) {
            this.pendingClientId = context;
        } else if (value === ConnectionState.Connected) {
            this._clientId = this.pendingClientId;
            this._deltaManager.updateQuorumJoin();
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this.pendingClientId = undefined;
        }

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(value, oldState, reason);

        if (this.loaded) {
            this.propagateConnectionState();
        }
    }

    private propagateConnectionState() {
        assert(this.loaded);
        const logOpsOnReconnect: boolean = this._connectionState === ConnectionState.Connected && !this.firstConnection;
        if (logOpsOnReconnect) {
            this.messageCountAfterDisconnection = 0;
        }
        this.context!.changeConnectionState(this._connectionState, this.clientId!, this._version);
        this.protocolHandler!.quorum.changeConnectionState(this._connectionState, this.clientId!);
        raiseConnectedEvent(this, this._connectionState, this.clientId!);
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

    // tslint:disable no-unsafe-any
    private getScopes(options: any): string[] {
        return options && options.tokens && options.tokens.jwt ?
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            (jwtDecode(options.tokens.jwt) as ITokenClaims).scopes : [];
    }
    // tslint:enable no-unsafe-any

    /**
     * Get the most recent snapshot, or a specific version.
     * @param specifiedVersion - The specific version of the snapshot to retrieve
     * @returns The snapshot requested, or the latest snapshot if no version was specified
     */
    private async fetchSnapshotTree(specifiedVersion?: string): Promise<ISnapshotTree | undefined> {
        const version = await this.getVersion(specifiedVersion || this.id);

        if (version) {
            return await this.storageService!.getSnapshotTree(version) || undefined;
        } else if (specifiedVersion) {
            // We should have a defined version to load from if specified version requested
            this.logger.sendErrorEvent({ eventName: "NoVersionFoundWhenSpecified", specifiedVersion });
        }

        return undefined;
    }

    private async loadContext(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        snapshot?: ISnapshotTree,
    ) {
        const chaincode = await this.loadCodeFromQuorum(this.protocolHandler!.quorum);
        this.pkg = chaincode.pkg;

        // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
        // are set. Global requests will still go to this loader
        const loader = new RelativeLoader(this.loader, this.originalRequest);

        this.context = await ContainerContext.load(
            this,
            this.scope,
            this.codeLoader,
            chaincode.chaincode,
            snapshot || { id: null, blobs: {}, commits: {}, trees: {} },
            attributes,
            this.blobManager,
            new DeltaManagerProxy(this._deltaManager),
            new QuorumProxy(this.protocolHandler!.quorum),
            loader,
            storage,
            (err) => this.raiseCriticalError(err),
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.submitSignal(message),
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (message) => this.snapshot(message),
            (reason?: string) => this.close(reason),
            Container.version,
        );

        loader.resolveContainer(this);
        this.emit("contextChanged", this.pkg);
    }

    // Please avoid calling it directly.
    // raiseCriticalError() is the right flow for most cases
    private logCriticalError(error: any) {
        this.logger.sendErrorEvent({ eventName: "onError", [TelemetryEventRaisedOnContainer]: true }, error);
    }
}
