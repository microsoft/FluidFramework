/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionState,
    FileMode,
    IChaincodeFactory,
    IClient,
    ICodeLoader,
    ICommittedProposal,
    IConnectionDetails,
    IContainer,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentService,
    IDocumentStorageService,
    IFluidCodeDetails,
    IGenericBlob,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
    ISignalMessage,
    ISnapshotTree,
    ITelemetryBaseLogger,
    ITelemetryLogger,
    ITree,
    ITreeEntry,
    MessageType,
    TelemetryEventRaisedOnContainer,
    TreeEntry,
} from "@prague/container-definitions";
import {
    buildHierarchy,
    ChildLogger,
    DebugLogger,
    flatten,
    PerformanceEvent,
    readAndParse,
} from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { BlobCacheStorageService } from "./blobCacheStorageService";
import { BlobManager } from "./blobManager";
import { ContainerContext } from "./containerContext";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";
import { Loader, RelativeLoader } from "./loader";
import { NullChaincode } from "./nullRuntime";
import { PrefetchDocumentStorageService } from "./prefetchDocumentStorageService";
import { isSystemMessage, ProtocolOpHandler } from "./protocol";
import { Quorum } from "./quorum";

interface IConnectResult {
    detailsP: Promise<IConnectionDetails | null>;

    handlerAttachedP: Promise<void>;
}

export class Container extends EventEmitter implements IContainer {
    public static async load(
        id: string,
        version: string,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        options: any,
        connection: string,
        loader: Loader,
        request: IRequest,
        canReconnect: boolean,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = new Container(
            id,
            options,
            service,
            codeLoader,
            loader,
            request,
            canReconnect,
            logger);
        await container.load(version, connection);

        return container;
    }

    public runtime: any = null;

    public subLogger: ITelemetryLogger;
    private readonly logger: ITelemetryLogger;

    private pendingClientId: string | undefined;
    private loaded = false;
    private blobManager: BlobManager | undefined;

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService | undefined | null;

    // tslint:disable:variable-name
    private _version: string | undefined;
    private _clientId: string | undefined;
    private _deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined;
    private _existing: boolean | undefined;
    private readonly _id: string;
    private _parentBranch: string | undefined | null;
    private _connectionState = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    private context: ContainerContext | undefined;
    private pkg: string | IFluidCodeDetails | undefined;
    private codeQuorumKey;
    private protocolHandler: ProtocolOpHandler | undefined;

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
     * The server provided id of the client.
     * Set once this.connected is true, otherwise undefined
     */
    public get clientId(): string | undefined {
        return this._clientId;
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
     * Returns the parent branch for this document
     */
    public get parentBranch(): string | undefined | null {
        return this._parentBranch;
    }

    constructor(
        id: string,
        public readonly options: any,
        private readonly service: IDocumentService,
        private readonly codeLoader: ICodeLoader,
        private readonly loader: Loader,
        private readonly originalRequest: IRequest,
        private readonly canReconnect: boolean,
        logger?: ITelemetryBaseLogger,
    ) {
        super();

        const [, documentId] = id.split("/");
        this._id = decodeURI(documentId);

        // create logger for components to use
        this.subLogger = DebugLogger.mixinDebugLogger(
            "prague:telemetry",
            {documentId: this.id},
            logger);

        // Prefix all events in this file with container-loader
        this.logger = ChildLogger.create(this.subLogger, "Container");

        this.on("error", (error: any) => {
            // tslint:disable-next-line:no-unsafe-any
            this.logger.sendErrorEvent({eventName: "onError", [TelemetryEventRaisedOnContainer]: true}, error);
        });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum {
        return this.protocolHandler!.quorum;
    }

    public on(event: "connected" | "contextChanged", listener: (clientId: string) => void): this;
    public on(event: "disconnected", listener: () => void): this;
    public on(event: "error", listener: (error: any) => void): this;
    public on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    public on(event: "pong" | "processTime", listener: (latency: number) => void): this;
    public on(event: MessageType.BlobUploaded, listener: (contents: any) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Modifies emit to also forward to the active runtime.
     */
    public emit(message: string | symbol, ...args: any[]): boolean {
        // Still need to emit down to a runtime?
        // const runtimeResult = this._runtime ? this._runtime.emit(message, ...args) : true;
        // Returns true if the event had listeners, false otherwise.
        // return superResult && runtimeResult;
        return super.emit(message, ...args);
    }

    public close() {
        if (this._deltaManager) {
            this._deltaManager.close();
        }

        this.removeAllListeners();
    }

    public async request(path: IRequest): Promise<IResponse> {
        if (!path) {
            return { mimeType: "prague/container", status: 200, value: this };
        }

        return this.context!.request(path);
    }

    public async snapshot(tagMessage: string): Promise<void> {
        // TODO: Issue-2171 Support for Branch Snapshots
        if (tagMessage.includes("ReplayTool Snapshot") === false && this.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        // Only snapshot once a code quorum has been established
        if (!this.protocolHandler!.quorum.has("code") && !this.protocolHandler!.quorum.has("code2")) {
            this.logger.sendTelemetryEvent({eventName: "SkipSnapshot"});
            return;
        }

        // Stop inbound message processing while we complete the snapshot
        try {
            if (this.deltaManager !== undefined) {
                await this.deltaManager.inbound.systemPause();
            }

            await this.snapshotCore(tagMessage);

        } catch (ex) {
            this.logger.logException({eventName: "SnapshotExceptionError"}, ex);
            throw ex;

        } finally {
            if (this.deltaManager !== undefined) {
                await this.deltaManager.inbound.systemResume();
            }
        }
    }

    private async snapshotCore(tagMessage: string) {
        // Snapshots base document state and currently running context
        const root = this.snapshotBase();
        const componentEntries = await this.context!.snapshot(tagMessage);

        // And then combine
        if (componentEntries) {
            root.entries.push(...componentEntries.entries);
        }

        // Generate base snapshot message
        const deltaDetails =
            `${this._deltaManager!.referenceSequenceNumber}:${this._deltaManager!.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storageService!.getVersions(this.id, 1);

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

    private async load(specifiedVersion: string, connection: string): Promise<void> {
        const connectionValues = connection.split(",");

        const connect = connectionValues.indexOf("open") !== -1;
        const pause = connectionValues.indexOf("pause") !== -1;

        const perfEvent = PerformanceEvent.start(this.logger, {eventName: "ContextLoadProgress", stage: "start"});

        const storageP = this.service.connectToStorage()
            .then((storage) => storage ? new PrefetchDocumentStorageService(storage) : null);

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        const versionP = storageP.then(async (storage) => {
            if (specifiedVersion === null) {
                return null;
            } else {
                const versionId = specifiedVersion ? specifiedVersion : this.id;
                const versions = await storage!.getVersions(versionId, 1);
                return versions.length > 0 ? versions[0] : null;
            }
        });

        // Get the snapshot tree
        const treeP = Promise.all([storageP, versionP]).then(
            ([storage, version]) => storage!.getSnapshotTree(version!));

        const attributesP = Promise.all([storageP, treeP]).then<IDocumentAttributes>(
            ([storage, tree]) => {
                if (tree === null) {
                    return {
                        branch: this.id,
                        minimumSequenceNumber: 0,
                        sequenceNumber: 0,
                    };
                }

                const attributesHash = ".protocol" in tree.trees
                    ? tree.trees[".protocol"].blobs.attributes
                    : tree.blobs[".attributes"];

                return readAndParse<IDocumentAttributes>(storage!, attributesHash);
            });

        // ...begin the connection process to the delta stream
        const connectResult: IConnectResult = this.createDeltaManager(attributesP, connect);

        // ...load in the existing quorum
        const protocolHandlerP = Promise.all([attributesP, storageP, treeP]).then(
            ([attributes, storage, tree]) => {
                // Initialize the protocol handler
                return this.initializeProtocolState(attributes, storage!, tree!);
            });

        // ...instantiate the chaincode defined on the document
        const chaincodeP = protocolHandlerP.then((protocolHandler) => this.loadCodeFromQuorum(protocolHandler.quorum));

        const blobManagerP = Promise.all([storageP, treeP]).then(
            ([storage, tree]) => this.loadBlobManager(storage!, tree!));

        // Wait for all the loading promises to finish
        return Promise
            .all([
                storageP,
                treeP,
                versionP,
                attributesP,
                blobManagerP,
                protocolHandlerP,
                chaincodeP,
                connectResult.handlerAttachedP,
            ])
            .then(async ([
                storageService,
                tree,
                version,
                attributes,
                blobManager,
                protocolHandler,
                chaincode]) => {

                this.protocolHandler = protocolHandler;
                this.storageService = storageService;
                this.blobManager = blobManager;
                this.pkg = chaincode.pkg;

                perfEvent.reportProgress({stage: "BeforeContextLoad"});

                // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
                // the initial details
                if (version) {
                    this._existing = true;
                    this._parentBranch = attributes.branch !== this.id ? attributes.branch : null;
                } else {
                    const details = await connectResult.detailsP;
                    this._existing = details!.existing;
                    this._parentBranch = details!.parentBranch;

                    perfEvent.reportProgress({stage: "AfterSocketConnect"});
                }

                // The relative loader will proxy requests to '/' to the loader itself assuming no non-cache flags
                // are set. Global requests will still go to this loader
                const loader = new RelativeLoader(this.loader, this.originalRequest);
                this.context = await ContainerContext.load(
                    this,
                    this.codeLoader,
                    chaincode.chaincode,
                    tree!,
                    attributes,
                    this.blobManager,
                    this._deltaManager!,
                    this.protocolHandler!.quorum,
                    loader,
                    storageService,
                    (err) => this.emit("error", err),
                    (type, contents) => this.submitMessage(type, contents),
                    (message) => this.submitSignal(message),
                    (message) => this.snapshot(message),
                    () => this.close());
                this.context!.changeConnectionState(this.connectionState, this.clientId!, this._version);
                loader.resolveContainer(this);

                if (connect) {
                    assert(this._deltaManager, "DeltaManager should have been created during connect call");
                    if (!pause) {
                        perfEvent.reportProgress({ stage: "resuming" });
                        this._deltaManager!.inbound.resume();
                        this._deltaManager!.outbound.resume();
                        this._deltaManager!.inboundSignal.resume();
                    }
                }

                // Internal context is fully loaded at this point
                this.loaded = true;

                perfEvent.end({ stage: "Loaded" });
            });
    }

    private async initializeProtocolState(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree,
    ): Promise<ProtocolOpHandler> {
        let members: Array<[string, ISequencedClient]>;
        let proposals: Array<[number, ISequencedProposal, string[]]>;
        let values: Array<[string, any]>;

        if (tree) {
            const baseTree = ".protocol" in tree.trees ? tree.trees[".protocol"] : tree;
            const snapshot = await Promise.all([
                readAndParse<Array<[string, ISequencedClient]>>(storage, baseTree.blobs.quorumMembers!),
                readAndParse<Array<[number, ISequencedProposal, string[]]>>(storage, baseTree.blobs.quorumProposals!),
                readAndParse<Array<[string, ICommittedProposal]>>(storage, baseTree.blobs.quorumValues!),
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
            this.subLogger);

        // Track membership changes and update connection state accordingly
        protocol.quorum.on("addMember", (clientId, details) => {
            // This is the only one that requires the pending client ID
            if (clientId === this.pendingClientId) {
                this.setConnectionState(
                    ConnectionState.Connected,
                    `joined @ ${details.sequenceNumber}`,
                    this.pendingClientId,
                    this._deltaManager!.version);
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

                    // Stop processing inbound messages/signals as we transition to the new code
                    this.deltaManager!.inbound.systemPause();
                    this.deltaManager!.inboundSignal.systemPause();
                    this.transitionRuntime(value as string).then(
                        () => {
                            // Resume once transition is complete
                            this.deltaManager!.inbound.systemResume();
                            this.deltaManager!.inboundSignal.systemResume();
                        },
                        (error) => {
                            this.emit("error", error);
                        });
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

    private async transitionRuntime(pkg: string | IFluidCodeDetails): Promise<void> {
        debug(`Transitioning runtime from ${this.pkg} to ${pkg}`);
        // No need to transition if package stayed the same
        if (pkg === this.pkg) {
            return;
        }

        // Load in the new host code and initialize the platform
        const chaincode = await this.loadCode(pkg);

        const previousContextState = await this.context!.stop();
        let snapshotTree: ISnapshotTree | null;
        const blobs = new Map();
        if (previousContextState) {
            const flattened = flatten(previousContextState.entries, blobs);
            snapshotTree = buildHierarchy(flattened);
        } else {
            snapshotTree = { id: null, blobs: {}, commits: {}, trees: {} };
        }

        const attributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager!.minimumSequenceNumber,
            sequenceNumber: this._deltaManager!.referenceSequenceNumber,
        };
        const documentStorageService = blobs.size > 0
            ? new BlobCacheStorageService(this.storageService!, blobs) : this.storageService;
        const loader = new RelativeLoader(this.loader, this.originalRequest);
        const newContext = await ContainerContext.load(
            this,
            this.codeLoader,
            chaincode,
            snapshotTree,
            attributes,
            this.blobManager,
            this._deltaManager!,
            this.protocolHandler!.quorum,
            loader,
            documentStorageService,
            (err) => this.emit("error", err),
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.submitSignal(message),
            (message) => this.snapshot(message),
            () => this.close());
        this.context = newContext;
        loader.resolveContainer(this);

        this.pkg = pkg;
        this.emit("contextChanged", this.pkg);
    }

    private async loadCodeFromQuorum(
        quorum: Quorum,
    ): Promise<{ pkg: string | IFluidCodeDetails | undefined, chaincode: IChaincodeFactory }> {
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
    private async loadCode(pkg: string | IFluidCodeDetails | undefined): Promise<IChaincodeFactory> {
        if (!pkg) {
            return new NullChaincode();
        }

        if (typeof pkg === "string") {
            return this.codeLoader.load<IChaincodeFactory>(pkg);
        } else {
            return typeof pkg.package === "string"
                ? this.codeLoader.load<IChaincodeFactory>(pkg.package, pkg)
                : this.codeLoader.load<IChaincodeFactory>(`${pkg.package.name}@${pkg.package.version}`, pkg);
        }
    }

    private createDeltaManager(attributesP: Promise<IDocumentAttributes>, connect: boolean): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        // tslint:disable-next-line:no-unsafe-any
        const clientDetails = this.options ? (this.options.client as IClient) : null;
        this._deltaManager = new DeltaManager(
            this.service,
            clientDetails,
            ChildLogger.create(this.logger, "DeltaManager"),
            this.canReconnect,
        );

        if (connect) {
            // Open a connection - the DeltaManager will automatically reconnect
            const detailsP = this._deltaManager.connect("Document loading");
            this._deltaManager.on("connect", (details: IConnectionDetails) => {
                this.setConnectionState(
                    ConnectionState.Connecting,
                    "websocket established",
                    details.clientId,
                    details.version);
            });

            this._deltaManager.on("disconnect", (reason: string) => {
                this.setConnectionState(ConnectionState.Disconnected, reason);
            });

            this._deltaManager.on("error", (error) => {
                this.emit("error", error);
            });

            this._deltaManager.on("pong", (latency) => {
                this.emit("pong", latency);
            });

            this._deltaManager.on("processTime", (time) => {
                this.emit("processTime", time);
            });

            // Begin fetching any pending deltas once we know the base sequence #. Can this fail?
            // It seems like something, like reconnection, that we would want to retry but otherwise allow
            // the document to load
            const handlerAttachedP = attributesP.then((attributes) => {
                this._deltaManager!.attachOpHandler(
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

            return { detailsP, handlerAttachedP };
        } else {
            const handlerAttachedP = attributesP.then((attributes) => {
                this._deltaManager!.attachOpHandler(
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

            return { detailsP: Promise.resolve(null), handlerAttachedP };
        }
    }

    private setConnectionState(value: ConnectionState.Disconnected, reason: string);
    private setConnectionState(
        value: ConnectionState.Connecting | ConnectionState.Connected,
        reason: string,
        clientId: string,
        version: string);
    private setConnectionState(value: ConnectionState, reason: string, context?: string, version?: string) {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            return;
        }

        this.logger.sendPerformanceEvent({
            eventName: "ConnectionStateChange",
            from: ConnectionState[this.connectionState],
            reason,
            to: ConnectionState[value],
        });

        this._connectionState = value;
        this._version = version;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        // This is especially important in the reconnect case. It's possible there could be outstanding
        // ops sent by this client, so we should keep the old client id until we see our own client's
        // join message. after we see the join message for out new connection with our new client id,
        // we know there can no longer be outstanding ops that we sent with the previous client id.
        if (value === ConnectionState.Connecting) {
            this.pendingClientId = context;
        } else if (value === ConnectionState.Connected) {
            this._deltaManager!.disableReadonlyMode();
            this._clientId = this.pendingClientId;
        }

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.context!.changeConnectionState(value, this.clientId!, this._version!);

        if (this.connectionState === ConnectionState.Connected) {
            this.emit("connected", this.pendingClientId, version);
        } else {
            this.emit("disconnected");
        }
    }

    private submitMessage(type: MessageType, contents: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            this.logger.sendErrorEvent({eventName: "SubmitMessageWithNoConnection", type});
            return -1;
        }

        // TODO it may be better not to stringify in this case and have the storage layer do this
        const serializedContent = JSON.stringify(contents);
        const clientSequenceNumber = this._deltaManager!.submit(type, serializedContent);

        return clientSequenceNumber;
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
        const local = this._clientId === message.clientId;
        this.context!.processSignal(message, local);
    }
}
