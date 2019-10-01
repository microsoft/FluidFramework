/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IComponent,
    IComponentQueryableLegacy,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ConnectionState,
    ICodeLoader,
    ICommittedProposal,
    IConnectionDetails,
    IContainer,
    IDeltaManager,
    IFluidCodeDetails,
    IFluidModule,
    IGenericBlob,
    IQuorum,
    IRuntimeFactory,
    ISequencedProposal,
    ITelemetryBaseLogger,
    ITelemetryLogger,
    TelemetryEventRaisedOnContainer,
} from "@microsoft/fluid-container-definitions";
import {
    buildHierarchy,
    ChildLogger,
    DebugLogger,
    EventEmitterWithErrorHandling,
    flatten,
    PerformanceEvent,
    raiseConnectedEvent,
    readAndParse,
    TelemetryLogger,
} from "@microsoft/fluid-core-utils";
import {
    FileMode,
    IClient,
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentService,
    IDocumentStorageService,
    ISequencedClient,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ITokenClaims,
    ITree,
    ITreeEntry,
    IVersion,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
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
import { isSystemMessage, ProtocolOpHandler } from "./protocol";
import { Quorum, QuorumProxy } from "./quorum";

// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now") as (() => number);

const PackageNotFactoryError = "Code package does not implement IRuntimeFactory";

export class Container extends EventEmitterWithErrorHandling implements IContainer {
    public static version = "^0.1.0";

    /**
     * Load container.
     *
     * @param specifiedVersion - one of the following
     *   - null: use ops, no snapshots
     *   - undefined - fetch latest snapshot
     *   - otherwise, version sha to load snapshot
     * @param connection - options (list of keywords). Accepted options are open & pause.
     */
    public static async load(
        id: string,
        version: string | null | undefined,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        options: any,
        scope: IComponent,
        connection: string,
        loader: Loader,
        request: IRequest,
        canReconnect: boolean,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = new Container(
            id,
            options,
            canReconnect,
            service,
            scope,
            codeLoader,
            loader,
            request,
            logger);

        return new Promise<Container>(async (res, rej) => {
            let alreadyRaisedError = false;
            const onError = (error) => {
                container.off("error", onError);
                // Depending where error happens, we can be attempting to connect to web socket
                // and continuously retrying (consider offline mode)
                // Host has no container to close, so it's prudent to do it here
                container.close();
                rej(error);
                alreadyRaisedError = true;
            };
            container.on("error", onError);

            return container.load(version, connection)
                .then(() => {
                    container.off("error", onError);
                    res(container);
                })
                .catch((error) => {
                    if (!alreadyRaisedError) {
                        container.logCriticalError(error);
                    }
                    container.ignoreUnhandledConnectonError();
                    onError(error);
            });
        });
    }

    public subLogger: TelemetryLogger;
    private readonly logger: ITelemetryLogger;

    private pendingClientId: string | undefined;
    private loaded = false;
    private blobManager: BlobManager | undefined;

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService | undefined | null;

    private _version: string | undefined;
    private _clientId: string | undefined;
    private _scopes: string[] | undefined;
    private _deltaManager: DeltaManager | undefined;
    private _existing: boolean | undefined;
    private readonly _id: string;
    private _parentBranch: string | undefined | null;
    private _connectionState = ConnectionState.Disconnected;
    private _serviceConfiguration: IServiceConfiguration | undefined;
    private readonly _audience: Audience;

    private context: ContainerContext | undefined;
    private pkg: string | IFluidCodeDetails | undefined;
    private codeQuorumKey;
    private protocolHandler: ProtocolOpHandler | undefined;
    private connectionDetailsP: Promise<IConnectionDetails | null> | undefined;

    private firstConnection = true;
    private readonly connectionTransitionTimes: number[] = [];

    public get id(): string {
        return this._id;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._deltaManager!;
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

    public get clientType(): string {
        return this._deltaManager!.clientType;
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

    constructor(
        id: string,
        public readonly options: any,
        public readonly canReconnect: boolean,
        private readonly service: IDocumentService,
        private readonly scope: IComponent,
        private readonly codeLoader: ICodeLoader,
        private readonly loader: Loader,
        private readonly originalRequest: IRequest,
        logger?: ITelemetryBaseLogger,
    ) {
        super();

        const [, documentId] = id.split("/");
        this._id = decodeURI(documentId);
        this._scopes = this.getScopes(options);
        this._audience = new Audience();

        // create logger for components to use
        this.subLogger = DebugLogger.mixinDebugLogger(
            "fluid:telemetry",
            {
                documentId: this.id,
                package: {
                    name: TelemetryLogger.sanitizePkgName(pkgName),
                    version: pkgVersion,
                },
            },
            logger);

        // Prefix all events in this file with container-loader
        this.logger = ChildLogger.create(this.subLogger, "Container");

        this.on("error", (error: any) => {
            this.logCriticalError(error);
        });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum {
        return this.protocolHandler!.quorum;
    }

    public on(event: "connected" | "contextChanged", listener: (clientId: string) => void): this;
    public on(event: "disconnected" | "joining", listener: () => void): this;
    public on(event: "error", listener: (error: any) => void): this;
    public on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    public on(event: "pong" | "processTime", listener: (latency: number) => void): this;
    public on(event: MessageType.BlobUploaded, listener: (contents: any) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public close() {
        if (this._deltaManager) {
            this._deltaManager.close();
        }

        if (this.protocolHandler) {
            this.protocolHandler.close();
        }

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
                await this.deltaManager.inbound.systemResume();
            }
        }
    }

    public resume() {
        assert(this.loaded);
        // resume processing ops
        this._deltaManager!.inbound.resume();
        this._deltaManager!.outbound.resume();
        this._deltaManager!.inboundSignal.resume();

        // Ensure connection to web socket
        this.connectToDeltaStream();

        // Do not leave unhandled rejected promise.
        // We report any connection errors through raiseCriticalError() mechanism
        // as they can happen after initial connection.
        this.ignoreUnhandledConnectonError();
    }

    public raiseCriticalError(error: any) {
        this.emit("error", error);
    }

    public reloadContext(): void {
        // pause inbound synchronously
        this.deltaManager!.inbound.systemPause();
        this.deltaManager!.inboundSignal.systemPause();

        this.reloadContextCore().then(() => {
            this.deltaManager!.inbound.systemResume();
            this.deltaManager!.inboundSignal.systemResume();
        });
    }

    private async reloadContextCore(): Promise<void> {
        const previousContextState = await this.context!.stop();

        let snapshot: ISnapshotTree | undefined;
        const blobs = new Map();
        if (previousContextState) {
            const flattened = flatten(previousContextState.entries, blobs);
            snapshot = buildHierarchy(flattened);
        }

        const storage = blobs.size > 0
            ? new BlobCacheStorageService(this.storageService!, blobs)
            : this.storageService!;

        const attributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager!.minimumSequenceNumber,
            sequenceNumber: this._deltaManager!.referenceSequenceNumber,
        };

        await this.loadContext(attributes, storage, snapshot);
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
            `${this._deltaManager!.referenceSequenceNumber}:${this._deltaManager!.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.getVersion(this.id);

        const parents = lastVersion.length > 0 ? [lastVersion[0].id] : [];

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
            minimumSequenceNumber: this._deltaManager!.minimumSequenceNumber,
            sequenceNumber: this._deltaManager!.referenceSequenceNumber,
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

    private getVersion(version: string): Promise<IVersion[]> {
        return this.storageService!.getVersions(version, 1);
    }

    private connectToDeltaStream() {
        if (!this.connectionDetailsP) {
            this.connectionTransitionTimes[ConnectionState.Disconnected] = performanceNow();
            this.connectionDetailsP = this._deltaManager!.connect("Document loading");
        }
        return this.connectionDetailsP;
    }

    private ignoreUnhandledConnectonError() {
        // avoid unhandled promises
        if (this.connectionDetailsP) {
            this.connectionDetailsP.catch(() => {});
        }
    }

    /**
     * Load container.
     *
     * @param specifiedVersion - one of the following
     *   - null: use ops, no snapshots
     *   - undefined - fetch latest snapshot
     *   - otherwise, version sha to load snapshot
     * @param connection - options (list of keywords). Accepted options are open & pause.
     */
    private async load(specifiedVersion: string | null | undefined, connection: string): Promise<void> {
        const connectionValues = connection.split(",");

        const connect = connectionValues.indexOf("open") !== -1;
        const pause = connectionValues.indexOf("pause") !== -1;

        const perfEvent = PerformanceEvent.start(this.logger, { eventName: "Load" });

        const storageP = this.service.connectToStorage().then((storage) => {
            this.storageService = new PrefetchDocumentStorageService(storage);
            return this.storageService;
        });

        // fetch specified snapshot
        const treeP = storageP.then(() => this.fetchSnapshotTree(specifiedVersion));

        const attributesP = Promise.all([storageP, treeP]).then<IDocumentAttributes>(
            ([storage, tree]) => {
                if (!tree) {
                    // Have to have a web socket - see code below requiring it!
                    this.connectToDeltaStream();
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
            });

        // ...begin the connection process to the delta stream
        const handlerAttachedP = this.createDeltaManager(attributesP, connect);

        if (connect && !pause) {
            this.connectToDeltaStream();
        }

        // ...load in the existing quorum
        const protocolHandlerP = Promise.all([attributesP, storageP, treeP]).then(
            ([attributes, storage, tree]) => {
                // Initialize the protocol handler
                return this.initializeProtocolState(attributes, storage, tree!);
            });

        const blobManagerP = Promise.all([storageP, treeP]).then(
            ([storage, tree]) => this.loadBlobManager(storage, tree!));

        // Wait for all the loading promises to finish
        return Promise
            .all([
                storageP,
                treeP,
                attributesP,
                blobManagerP,
                protocolHandlerP,
                handlerAttachedP,
            ])
            .then(async ([
                storage,
                tree,
                attributes,
                blobManager,
                protocolHandler]) => {

                this.protocolHandler = protocolHandler;
                this.blobManager = blobManager;

                perfEvent.reportProgress({}, "beforeContextLoad");

                // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
                // the initial details
                if (tree) {
                    this._existing = true;
                    this._parentBranch = attributes.branch !== this.id ? attributes.branch : null;
                } else {
                    const details = await this.connectToDeltaStream();

                    this._existing = details!.existing;
                    this._parentBranch = details!.parentBranch;
                }

                await this.loadContext(attributes, storage, tree);

                this.context!.changeConnectionState(this.connectionState, this.clientId!, this._version);

                // Internal context is fully loaded at this point
                this.loaded = true;

                if (connect && !pause) {
                    this.resume();
                }

                perfEvent.end({}, tree ? "end" : "end_NoSnapshot");
            });
    }

    private async initializeProtocolState(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree,
    ): Promise<ProtocolOpHandler> {
        let members: [string, ISequencedClient][];
        let proposals: [number, ISequencedProposal, string[]][];
        let values: [string, any][];

        if (tree) {
            const baseTree = ".protocol" in tree.trees ? tree.trees[".protocol"] : tree;
            const snapshot = await Promise.all([
                readAndParse<[string, ISequencedClient][]>(storage, baseTree.blobs.quorumMembers!),
                readAndParse<[number, ISequencedProposal, string[]][]>(storage, baseTree.blobs.quorumProposals!),
                readAndParse<[string, ICommittedProposal][]>(storage, baseTree.blobs.quorumValues!),
            ]);

            members = snapshot[0];
            proposals = snapshot[1];
            values = snapshot[2];
        } else {
            members = [];
            proposals = [];
            values = [];
        }

        const protocol = new ProtocolOpHandler(
            attributes.branch,
            attributes.minimumSequenceNumber!,
            attributes.sequenceNumber!,
            members,
            proposals,
            values,
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            (sequenceNumber) => this.submitMessage(MessageType.Reject, sequenceNumber),
            ChildLogger.create(this.subLogger, "ProtocolHandler"));

        // Track membership changes and update connection state accordingly
        protocol.quorum.on("addMember", (clientId, details) => {
            // This is the only one that requires the pending client ID
            if (clientId === this.pendingClientId) {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined @ ${details.sequenceNumber}`,
                    this.pendingClientId,
                    this._deltaManager!.version,
                    details.client.scopes,
                    this._deltaManager!.serviceConfiguration);
            }
        });

        protocol.quorum.on("removeMember", (clientId) => {
            if (clientId === this._clientId) {
                this._deltaManager!.updateQuorumLeave();
            }
        });

        protocol.quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                debug(`approved ${key}`);
                if (key === "code" || key === "code2") {
                    // back compat - can remove in 0.7
                    if (!this.codeQuorumKey) {
                        this.codeQuorumKey = key;
                    }

                    // back compat - can remove in 0.7
                    if (key !== this.codeQuorumKey) {
                        return;
                    }

                    debug(`loadCode ${JSON.stringify(value)}`);

                    if (value === this.pkg) {
                        return;
                    }

                    this.reloadContext();
                }
            });

        return protocol;
    }

    private async loadBlobManager(storage: IDocumentStorageService, tree: ISnapshotTree): Promise<BlobManager> {
        const blobHash = tree && tree.blobs[".blobs"];
        const blobs: IGenericBlob[] = blobHash
            ? await readAndParse<IGenericBlob[]>(storage, blobHash)
            : [];

        const blobManager = new BlobManager(storage);
        // tslint:disable-next-line:no-floating-promises
        blobManager.loadBlobMetadata(blobs);

        return blobManager;
    }

    private async loadCodeFromQuorum(
        quorum: Quorum,
    ): Promise<{ pkg: string | IFluidCodeDetails | undefined, chaincode: IRuntimeFactory }> {
        // back compat - can remove in 0.7
        const codeQuorumKey = quorum.has("code")
            ? "code"
            : quorum.has("code2") ? "code2" : undefined;
        this.codeQuorumKey = codeQuorumKey;

        const pkg = codeQuorumKey ? quorum.get(codeQuorumKey) as string | IFluidCodeDetails : undefined;
        const chaincode = await this.loadCode(pkg);

        return { chaincode, pkg };
    }

    /**
     * Loads the code for the provided package
     */
    private async loadCode(pkg: string | IFluidCodeDetails | undefined): Promise<IRuntimeFactory> {
        if (!pkg) {
            return new NullChaincode();
        }

        let componentP: Promise<IRuntimeFactory | IFluidModule>;
        if (typeof pkg === "string") {
            componentP = this.codeLoader.load<IRuntimeFactory | IFluidModule>(pkg);
        } else {
            componentP = typeof pkg.package === "string"
                ? this.codeLoader.load<IRuntimeFactory | IFluidModule>(pkg.package, pkg)
                : this.codeLoader.load<IRuntimeFactory | IFluidModule>(
                    `${pkg.package.name}@${pkg.package.version}`, pkg);
        }
        const component = await componentP;

        if ("fluidExport" in component) {
            let factory: IRuntimeFactory | undefined;
            if (component.fluidExport.IRuntimeFactory) {
                factory = component.fluidExport.IRuntimeFactory;
            } else {
                const queryable = component.fluidExport as IComponentQueryableLegacy;
                if (queryable.query) {
                    factory = queryable.query<IRuntimeFactory>("IRuntimeFactory");
                }
            }

            return factory ? factory : Promise.reject(PackageNotFactoryError);
        }

        // TODO included for back-compat
        if ("instantiateRuntime" in component) {
            return component;
        }

        return Promise.reject(PackageNotFactoryError);
    }

    private createDeltaManager(attributesP: Promise<IDocumentAttributes>, connect: boolean): Promise<void> {
        // Create the DeltaManager and begin listening for connection events
        // tslint:disable-next-line:no-unsafe-any
        const clientDetails = this.options ? (this.options.client as IClient) : null;
        this._deltaManager = new DeltaManager(
            this.service,
            clientDetails,
            ChildLogger.create(this.subLogger, "DeltaManager"),
            this.canReconnect,
        );

        if (connect) {
            // Open a connection - the DeltaManager will automatically reconnect
            this._deltaManager.on("connect", (details: IConnectionDetails) => {
                this.setConnectionState(
                    ConnectionState.Connecting,
                    "websocket established",
                    details.clientId,
                    details.version,
                    details.claims.scopes,
                    details.serviceConfiguration);

                if (this._deltaManager!.connectionMode === "read") {
                    this.setConnectionState(
                        ConnectionState.Connected,
                        `joined as readonly`,
                        details.clientId,
                        this._deltaManager!.version,
                        details.claims.scopes,
                        this._deltaManager!.serviceConfiguration);
                }

                // back-compat for new client and old server.
                this._audience.clear();

                const priorClients = details.initialClients ? details.initialClients : [];
                for (const client of priorClients) {
                    this._audience.addMember(client.clientId, client.client);
                }
            });

            this._deltaManager.on("disconnect", (reason: string) => {
                this.setConnectionState(ConnectionState.Disconnected, reason);
            });

            this._deltaManager.on("error", (error) => {
                this.raiseCriticalError(error);
            });

            this._deltaManager.on("pong", (latency) => {
                this.emit("pong", latency);
            });

            this._deltaManager.on("processTime", (time) => {
                this.emit("processTime", time);
            });

            // If we're the outer frame, do we want to do this?
            // Begin fetching any pending deltas once we know the base sequence #. Can this fail?
            // It seems like something, like reconnection, that we would want to retry but otherwise allow
            // the document to load
            const handlerAttachedP = attributesP.then((attributes) => {
                this._deltaManager!.attachOpHandler(
                    attributes.minimumSequenceNumber,
                    attributes.sequenceNumber,
                    {
                        process: (message, callback) => {
                            this.processRemoteMessage(message, callback);
                        },
                        processSignal: (message) => {
                            this.processSignal(message);
                        },
                    },
                    true);
            });

            return handlerAttachedP;
        } else {
            const handlerAttachedP = attributesP.then((attributes) => {
                this._deltaManager!.attachOpHandler(
                    attributes.minimumSequenceNumber,
                    attributes.sequenceNumber,
                    {
                        process: (message) => {
                            throw new Error("Delta manager is offline");
                        },
                        processSignal: (message) => {
                            throw new Error("Delta manager is offline");
                        },
                    },
                    false);
            });

            return handlerAttachedP;
        }
    }

    private logConnectionStateChangeTelemetry(value: ConnectionState, reason: string) {
        // We do not have good correlation ID to match server activity.
        // Add couple IDs here
        this.subLogger.setProperties({
            SocketClientId: this.clientId,
            SocketDocumentId: this._deltaManager!.socketDocumentId,
            SocketPendingClientId: value === ConnectionState.Connecting ? this.pendingClientId : undefined,
        });

        // Log actual event
        const time = performanceNow();
        this.connectionTransitionTimes[value] = time;
        const duration = time - this.connectionTransitionTimes[this.connectionState];
        this.logger.sendPerformanceEvent({
            eventName: `ConnectionStateChange_${ConnectionState[value]}`,
            from: ConnectionState[this.connectionState],
            duration,
            reason,
        });

        if (value === ConnectionState.Connected) {
            // We just logged event with disconnected/connecting -> connected time
            // Log extra event recording disconnected -> connected time, as well as provide some extra info.
            // We can group that info in previous event, but it's easier to analyze telemetry if these are
            // two separate events (actually - three!).
            this.logger.sendPerformanceEvent({
                eventName: this.firstConnection ? "ConnectionStateChange_InitialConnect" : "ConnectionStateChange_Reconnect",
                duration: time - this.connectionTransitionTimes[this.connectionState],
                reason,
            });
            this.firstConnection = false;
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
            return;
        }

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
            this._deltaManager!.updateQuorumJoin();
        } else if (value === ConnectionState.Disconnected) {
            // Important as we process our own joinSession message through delta request
            this.pendingClientId = undefined;
        }

        // Report telemetry after we set client id!
        this.logConnectionStateChangeTelemetry(value, reason);

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.context!.changeConnectionState(value, this.clientId!, this._version!);

        this.protocolHandler!.quorum.changeConnectionState(value, this.clientId!);

        raiseConnectedEvent(this, value, this.clientId!);
    }

    private submitMessage(type: MessageType, contents: any, batch?: boolean, metadata?: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            this.logger.sendErrorEvent({ eventName: "SubmitMessageWithNoConnection", type });
            return -1;
        }

        return this._deltaManager!.submit(type, contents, batch, metadata);
    }

    private processRemoteMessage(message: ISequencedDocumentMessage, callback: (err?: any) => void) {
        if (this.context!.legacyMessaging) {
            this.processRemoteMessageLegacy(message).then(
                () => { callback(); },
                (error) => { callback(error); });
        } else {
            this.processRemoteMessageNew(message);
            callback();
        }
    }

    private async processRemoteMessageLegacy(message: ISequencedDocumentMessage) {
        const local = this._clientId === message.clientId;
        let context;

        // Forward non system messages to the loaded runtime for processing
        if (!isSystemMessage(message)) {
            context = await this.context!.prepare(message, local);

            this.context!.process(message, local, context);
        }

        switch (message.type) {
            case MessageType.BlobUploaded:
                // tslint:disable-next-line:no-floating-promises
                this.blobManager!.addBlob(message.contents as IGenericBlob);
                this.emit(MessageType.BlobUploaded, message.contents);
                break;

            default:
        }

        // Allow the protocol handler to process the message
        this.protocolHandler!.processMessage(message, local);

        this.emit("op", message);

        if (!isSystemMessage(message)) {
            await this.context!.postProcess(message, local, context);
        }
    }

    private processRemoteMessageNew(message: ISequencedDocumentMessage) {
        const local = this._clientId === message.clientId;

        // Forward non system messages to the loaded runtime for processing
        if (!isSystemMessage(message)) {
            this.context!.process(message, local, undefined);
        }

        // Allow the protocol handler to process the message
        this.protocolHandler!.processMessage(message, local);

        this.emit("op", message);
    }

    private submitSignal(message: any) {
        this._deltaManager!.submitSignal(JSON.stringify(message));
    }

    private processSignal(message: ISignalMessage) {
        // No clientId indicates a system signal message.
        if (message.clientId === null && this._audience) {
            const innerContent = message.content as { content: any, type: string };
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
            (jwtDecode(options.tokens.jwt) as ITokenClaims).scopes : [];
    }
    // tslint:enable no-unsafe-any

    private async fetchSnapshotTree(specifiedVersion: string | null | undefined): Promise<ISnapshotTree | undefined> {
        if (specifiedVersion === null) {
            // intentionally do not load from snapshot
            return undefined;
        }

        const versions = await this.getVersion(specifiedVersion || this.id);
        const version = versions ? versions[0] : undefined;

        if (version) {
            return await this.storageService!.getSnapshotTree(version) || undefined;
        } else if (specifiedVersion) {
            // we should have a defined version to load from if specified version requested
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
            new DeltaManagerProxy(this._deltaManager!),
            new QuorumProxy(this.protocolHandler!.quorum),
            loader,
            storage,
            (err) => this.raiseCriticalError(err),
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.submitSignal(message),
            (message) => this.snapshot(message),
            () => this.close(),
            Container.version,
        );

        loader.resolveContainer(this);
        this.emit("contextChanged", this.pkg);
    }

    // Please avoid calling it directly.
    // raiseCriticalError() is the right flow for most cases
    private logCriticalError(error: any) {
        // tslint:disable-next-line:no-unsafe-any
        this.logger.sendErrorEvent({ eventName: "onError", [TelemetryEventRaisedOnContainer]: true }, error);
    }
}
