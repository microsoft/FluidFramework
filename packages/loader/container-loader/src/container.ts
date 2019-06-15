import {
    ConnectionState,
    FileMode,
    IChaincodeFactory,
    IChunkedOp,
    IClient,
    IClientJoin,
    ICodeLoader,
    ICommittedProposal,
    IConnectionDetails,
    IContainer,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentService,
    IDocumentStorageService,
    IGenericBlob,
    ILoader,
    IProposal,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISequencedProposal,
    ISignalMessage,
    ISnapshotTree,
    ISummaryAuthor,
    ISummaryCommit,
    ISummaryTree,
    ITelemetryBaseLogger,
    ITelemetryLogger,
    ITree,
    ITreeEntry,
    MessageType,
    SummaryObject,
    SummaryType,
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
import { BlobManager } from "./blobManager";
import { ContainerContext } from "./containerContext";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";
import { NullChaincode } from "./nullRuntime";
import { PrefetchDocumentStorageService } from "./prefetchDocumentStorageService";
import { Quorum } from "./quorum";

interface IConnectResult {
    detailsP: Promise<IConnectionDetails | null>;

    handlerAttachedP: Promise<void>;
}

interface IBufferedChunk {
    type: MessageType;

    content: string;
}

export class Container extends EventEmitter implements IContainer {
    public static async load(
        id: string,
        version: string,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        options: any,
        connection: string,
        loader: ILoader,
        logger?: ITelemetryBaseLogger,
    ): Promise<Container> {
        const container = new Container(
            id,
            options,
            service,
            codeLoader,
            loader,
            logger);
        await container.load(version, connection);

        return container;
    }

    public runtime: any = null;

    public subLogger: ITelemetryLogger;
    private readonly logger: ITelemetryLogger;

    private pendingClientId: string | undefined;
    private loaded = false;
    private quorum: Quorum | undefined;
    private blobManager: BlobManager | undefined;
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService | undefined | null;

    // tslint:disable:variable-name
    private _clientId: string | undefined;
    private _deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined;
    private _existing: boolean | undefined;
    private readonly _id: string;
    private _parentBranch: string | undefined | null;
    private _connectionState = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    private context: ContainerContext | undefined;
    private pkg: string | null = null;

    // Local copy of incomplete received chunks.
    private readonly chunkMap = new Map<string, string[]>();

    // Local copy of sent but unacknowledged chunks.
    private readonly unackedChunkedMessages: Map<number, IBufferedChunk> = new Map<number, IBufferedChunk>();

    public get id(): string {
        return this._id;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined {
        return this._deltaManager;
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

    public get chaincodePackage(): string | null {
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
        private readonly loader: ILoader,
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
            this.logger.logGenericError("onError", error);
        });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): IQuorum | undefined {
        return this.quorum;
    }

    public on(event: "connected" | "contextChanged", listener: (clientId: string) => void): this;
    public on(event: "disconnect", listener: () => void): this;
    public on(event: "error", listener: (error: any) => void): this;
    public on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    public on(event: "pong" | "processTime", listener: (latency: number) => void): this;

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

    // * EXPERIMENTAL - checked in to bring up the feature but please still use snapshots
    // If the app is in control - especially around proposal values - does generateSummary even exist in this
    // place? Or does the app hand a summary out with rules on how to apply it? Probably this actually
    public async generateSummary(
        author: ISummaryAuthor,
        committer: ISummaryAuthor,
        message: string,
        parents: string[],
    ): Promise<void> {
        // TODO: Issue-2171 Support for Branch Snapshots
        if (this.parentBranch) {
            debug(`Skipping summary due to being branch of ${this.parentBranch}`);
            return;
        }

        if (!this.context!.canSummarize) {
            debug(`Runtime does not support summary ops`);
            return;
        }

        if (!("uploadSummary" in this.storageService!)) {
            debug(`Driver does not support summary ops`);
            return;
        }

        try {
            if (this.deltaManager !== undefined) {
                this.deltaManager.inbound.systemPause();
            }

            const summary = await this.summarizeCore(author, committer, message, parents);

            // TODO I think I want to define the summary op proposal in more detail
            // contain the sequenceNumber
            // etag for previous commit - avoid replay going wrong
            // "force" summary - meaning it will destroy history - overwrite. Previous commit should match etag
            // unless this bit is explicitly set
            // "reload" - clients expected to reload off the contents of the summary (not implemented)
            this.quorum!.propose("summary", summary);
        } catch (ex) {
            debug("Summary error", ex);
            throw ex;
        } finally {
            // Restart the delta manager
            if (this.deltaManager !== undefined) {
                this.deltaManager.inbound.systemResume();
            }
        }
    }

    public async snapshot(tagMessage: string): Promise<void> {
        // TODO: Issue-2171 Support for Branch Snapshots
        if (tagMessage.includes("ReplayTool Snapshot") === false && this.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        // Only snapshot once a code quorum has been established
        if (!this.quorum!.has("code2")) {
            this.logger.sendTelemetryEvent({eventName: "SkipSnapshot"});
            return;
        }

        // Stop inbound message processing while we complete the snapshot
        // TODO I should verify that when paused, if we are in the middle of a prepare, we will not process the message
        try {
            if (this.deltaManager !== undefined) {
                this.deltaManager.inbound.pause();
            }

            await this.snapshotCore(tagMessage);

        } catch (ex) {
            this.logger.logException({eventName: "SnapshotExceptionError"}, ex);
            throw ex;

        } finally {
            if (this.deltaManager !== undefined) {
                this.deltaManager.inbound.resume();
            }
        }
    }

    private async summarizeCore(
        author: ISummaryAuthor,
        committer: ISummaryAuthor,
        message: string,
        parents: string[],
    ): Promise<any> {
        const entries: { [path: string]: SummaryObject } = {};

        const blobMetaData = this.blobManager!.getBlobMetadata();
        entries[".blobs"] = {
            content: JSON.stringify(blobMetaData),
            type: SummaryType.Blob,
        };

        const quorumSnapshot = this.quorum!.snapshot();

        entries.quorumMembers = {
            content: JSON.stringify(quorumSnapshot.members),
            type: SummaryType.Blob,
        };

        entries.quorumProposals = {
            content: JSON.stringify(quorumSnapshot.proposals),
            type: SummaryType.Blob,
        };

        entries.quorumValues = {
            content: JSON.stringify(quorumSnapshot.values),
            type: SummaryType.Blob,
        };

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager!.minimumSequenceNumber,
            partialOps: [...this.chunkMap],
            sequenceNumber: this._deltaManager!.referenceSequenceNumber,
        };
        entries[".attributes"] = {
            content: JSON.stringify(documentAttributes),
            type: SummaryType.Blob,
        };

        const componentEntries = await this.context!.summarize();

        // And then combine
        const root: ISummaryTree = {
            tree: { ...entries, ...componentEntries.tree },
            type: SummaryType.Tree,
        };

        // Delta storage is up to the runtime to store

        const summaryCommit: ISummaryCommit = {
            author,
            committer,
            message,
            parents,
            tree: root,
            type: SummaryType.Commit,
        };

        return this.storageService!.uploadSummary(summaryCommit);
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
        const snapshotSequenceNumber = this._deltaManager!.referenceSequenceNumber;
        const deltaDetails =
            `${this._deltaManager!.referenceSequenceNumber}:${this._deltaManager!.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storageService!.getVersions(this.id, 1);

        // Pull the sequence number stored with the previous version
        let sequenceNumber: number | undefined | null = 0;
        if (lastVersion.length > 0) {
            const attributesAsString = await this.storageService!.getContent(lastVersion[0], ".attributes");
            const decoded = Buffer.from(attributesAsString!, "base64").toString();
            const attributes = JSON.parse(decoded) as IDocumentAttributes;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Retrieve all deltas from sequenceNumber to snapshotSequenceNumber. Range is exclusive so we increment
        // the snapshotSequenceNumber by 1 to include it.
        // TODO We likely then want to filter the operation list to each component to use in its snapshot
        const deltas = await this._deltaManager!.getDeltas("Snapshot", sequenceNumber!, snapshotSequenceNumber! + 1);

        const parents = lastVersion.length > 0 ? [lastVersion[0].id] : [];
        root.entries.push({
            mode: FileMode.File,
            path: "deltas",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(deltas),
                encoding: "utf-8",
            },
        });

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

        const quorumSnapshot = this.quorum!.snapshot();
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
            partialOps: [...this.chunkMap],
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
                return tree !== null
                    ? readAndParse<IDocumentAttributes>(storage!, tree!.blobs[".attributes"]!)
                    : {
                        branch: this.id,
                        clients: [],
                        minimumSequenceNumber: 0,
                        package: "",
                        partialOps: [],
                        proposals: [],
                        sequenceNumber: 0,
                        values: [],
                    };
            });

        // ...begin the connection process to the delta stream
        const connectResult: IConnectResult = this.createDeltaManager(attributesP, connect);

        // ...load in the existing quorum
        const quorumP = Promise.all([attributesP, storageP, treeP]).then(
            ([attributes, storage, tree]) => this.loadQuorum(attributes, storage!, tree!));

        // ...instantiate the chaincode defined on the document
        const chaincodeP = quorumP.then((quorum) => this.loadCodeFromQuorum(quorum));

        const blobManagerP = Promise.all([storageP, treeP]).then(
            ([storage, tree]) => this.loadBlobManager(storage!, tree!));

        // Wait for all the loading promises to finish
        return Promise
            .all([
                storageP,
                treeP,
                versionP,
                attributesP,
                quorumP,
                blobManagerP,
                chaincodeP,
                connectResult.handlerAttachedP,
            ])
            .then(async ([
                storageService,
                tree,
                version,
                attributes,
                quorum,
                blobManager,
                chaincode]) => {

                this.quorum = quorum;
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

                this.context = await ContainerContext.load(
                    this,
                    this.codeLoader,
                    chaincode.chaincode,
                    tree!,
                    new Map(),
                    attributes,
                    this.blobManager,
                    this._deltaManager,
                    this.quorum,
                    this.loader,
                    storageService,
                    (err) => this.emit("error", err),
                    (type, contents) => this.submitMessage(type, contents),
                    (message) => this.submitSignal(message),
                    (message) => this.snapshot(message),
                    () => this.close());
                this.context!.changeConnectionState(this.connectionState, this.clientId!);

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

    private async loadQuorum(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree): Promise<Quorum> {

        let members: Array<[string, ISequencedClient]>;
        let proposals: Array<[number, ISequencedProposal, string[]]>;
        let values: Array<[string, any]>;

        if (tree) {
            const snapshot = await Promise.all([
                readAndParse<Array<[string, ISequencedClient]>>(storage, tree.blobs.quorumMembers!),
                readAndParse<Array<[number, ISequencedProposal, string[]]>>(storage, tree.blobs.quorumProposals!),
                readAndParse<Array<[string, ICommittedProposal]>>(storage, tree.blobs.quorumValues!),
            ]);

            members = snapshot[0];
            proposals = snapshot[1];
            values = snapshot[2];
        } else {
            members = [];
            proposals = [];
            values = [];
        }

        const quorum = new Quorum(
            attributes.minimumSequenceNumber,
            members,
            proposals,
            values,
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            (sequenceNumber) => this.submitMessage(MessageType.Reject, sequenceNumber));

        quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                debug(`approved ${key}`);
                if (key === "code2") {
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

        return quorum;
    }

    private async loadBlobManager(storage: IDocumentStorageService, tree: ISnapshotTree): Promise<BlobManager> {
        const blobs: IGenericBlob[] = tree
            ? await readAndParse<IGenericBlob[]>(storage, tree.blobs[".blobs"]!)
            : [];

        const blobManager = new BlobManager(storage);
        // tslint:disable-next-line:no-floating-promises
        blobManager.loadBlobMetadata(blobs);

        return blobManager;
    }

    private async transitionRuntime(pkg: string): Promise<void> {
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
            partialOps: null,
            sequenceNumber: this._deltaManager!.referenceSequenceNumber,
        };

        const newContext = await ContainerContext.load(
            this,
            this.codeLoader,
            chaincode,
            snapshotTree,
            blobs,
            attributes,
            this.blobManager,
            this._deltaManager,
            this.quorum,
            this.loader,
            this.storageService,
            (err) => this.emit("error", err),
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.submitSignal(message),
            (message) => this.snapshot(message),
            () => this.close());
        this.context = newContext;

        this.pkg = pkg;
        this.emit("contextChanged", this.pkg);
    }

    private async loadCodeFromQuorum(quorum: Quorum): Promise<{ pkg: string | null, chaincode: IChaincodeFactory }> {
        const pkg = quorum.has("code2") ? (quorum.get("code2") as string) : null;
        const chaincode = await this.loadCode(pkg);

        return { chaincode, pkg };
    }

    /**
     * Loads the code for the provided package
     */
    private async loadCode(pkg: string | null): Promise<IChaincodeFactory> {
        return pkg ? this.codeLoader.load(pkg) : new NullChaincode();
    }

    private createDeltaManager(attributesP: Promise<IDocumentAttributes>, connect: boolean): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        // tslint:disable-next-line:no-unsafe-any
        const clientDetails = this.options ? (this.options.client as IClient) : null;
        this._deltaManager = new DeltaManager(
            this.service,
            clientDetails,
            ChildLogger.create(this.logger, "DeltaManager"),
        );

        if (connect) {
            // Open a connection - the DeltaManager will automatically reconnect
            const detailsP = this._deltaManager.connect("Document loading");
            this._deltaManager.on("connect", (details: IConnectionDetails) => {
                this.setConnectionState(ConnectionState.Connecting, "websocket established", details.clientId);
                this.sendUnackedChunks();
            });

            this._deltaManager.on("disconnect", (nack: boolean) => {
                this.setConnectionState(ConnectionState.Disconnected, `nack === ${nack}`);
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
                        postProcess: (message, context) => {
                            return this.postProcessRemoteMessage(message, context);
                        },
                        prepare: (message) => {
                            return this.prepareRemoteMessage(message);
                        },
                        process: (message, context) => {
                            this.processRemoteMessage(message, context);
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
                        postProcess: (message, context) => {
                            throw new Error("Delta manager is offline");
                        },
                        prepare: (message) => {
                            throw new Error("Delta manager is offline");
                        },
                        process: (message, context) => {
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
    private setConnectionState(value: ConnectionState.Connecting | ConnectionState.Connected,
                               reason: string,
                               clientId: string);
    private setConnectionState(value: ConnectionState, reason: string, context?: string) {
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

        this.context!.changeConnectionState(value, this.clientId!);

        if (this.connectionState === ConnectionState.Connected) {
            this.emit("connected", this.pendingClientId);
        } else {
            this.emit("disconnected");
        }
    }

    private sendUnackedChunks() {
        for (const message of this.unackedChunkedMessages) {
            debug(`Resending unacked chunks!`);
            this.submitChunkedMessage(
                message[1].type,
                message[1].content,
                this._deltaManager!.maxMessageSize);
        }
    }

    private submitMessage(type: MessageType, contents: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            return -1;
        }

        const serializedContent = JSON.stringify(contents);
        const maxOpSize = this._deltaManager!.maxMessageSize;

        let clientSequenceNumber: number;
        if (serializedContent.length <= maxOpSize) {
            clientSequenceNumber = this._deltaManager!.submit(type, serializedContent);
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
        const chunkN = Math.floor(contentLength / maxOpSize) + ((contentLength % maxOpSize === 0) ? 0 : 1);
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
            clientSequenceNumber = this._deltaManager!.submit(MessageType.ChunkedOp, JSON.stringify(chunkedOp));
        }
        return clientSequenceNumber;
    }

    private async prepareRemoteMessage(message: ISequencedDocumentMessage): Promise<any> {
        const local = this._clientId === message.clientId;

        switch (message.type) {
            case MessageType.ClientJoin:
            case MessageType.ClientLeave:
            case MessageType.Propose:
            case MessageType.Reject:
            case MessageType.BlobUploaded:
            case MessageType.NoOp:
                break;

            case MessageType.ChunkedOp:
                const chunkComplete = this.prepareRemoteChunkedMessage(message);
                if (!chunkComplete) {
                    return Promise.resolve();
                } else {
                    if (local) {
                        const clientSeqNumber = message.clientSequenceNumber;
                        if (this.unackedChunkedMessages.has(clientSeqNumber)) {
                            this.unackedChunkedMessages.delete(clientSeqNumber);
                        }
                    }
                    return this.prepareRemoteMessage(message);
                }

            default:
                return this.context!.prepare(message, local);
        }
    }

    private prepareRemoteChunkedMessage(message: ISequencedDocumentMessage): boolean {
        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent.contents);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            const serializedContent = this.chunkMap.get(clientId)!.join("");
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
        this.chunkMap.get(clientId)!.push(chunkedContent);
    }

    private clearPartialChunks(clientId: string) {
        if (this.chunkMap.has(clientId)) {
            this.chunkMap.delete(clientId);
        }
    }

    private processRemoteMessage(message: ISequencedDocumentMessage, context: any) {
        const local = this._clientId === message.clientId;

        // Add the message to the list of pending messages so we can transform them during a snapshot
        // Reset the list of messages we have received since the min sequence number changed
        this.messagesSinceMSNChange.push(message);
        let index = 0;

        for (; index < this.messagesSinceMSNChange.length; index++) {
            if (this.messagesSinceMSNChange[index].sequenceNumber > message.minimumSequenceNumber) {
                break;
            }
        }
        if (index !== 0) {
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
        }

        const eventArgs: any[] = [message];
        switch (message.type) {
            case MessageType.ClientJoin:
                const systemJoinMessage = message as ISequencedDocumentSystemMessage;
                const join = JSON.parse(systemJoinMessage.data) as IClientJoin;
                // TODO this needs to be fixed
                const member: ISequencedClient = {
                    client: join.detail,
                    sequenceNumber: systemJoinMessage.sequenceNumber,
                };
                this.quorum!.addMember(join.clientId, member);

                // This is the only one that requires the pending client ID
                if (join.clientId === this.pendingClientId) {
                    this.setConnectionState(
                        ConnectionState.Connected,
                        `joined @ ${message.minimumSequenceNumber}`,
                        this.pendingClientId);
                }

                this.emit("clientJoin", join);
                break;

            case MessageType.ClientLeave:
                const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
                const clientId = JSON.parse(systemLeaveMessage.data) as string;
                this.clearPartialChunks(clientId);
                this.quorum!.removeMember(clientId);
                this.emit("clientLeave", clientId);
                break;

            case MessageType.Propose:
                const proposal = message.contents as IProposal;
                this.quorum!.addProposal(
                    proposal.key,
                    proposal.value,
                    message.sequenceNumber,
                    local,
                    message.clientSequenceNumber);
                break;

            case MessageType.Reject:
                const sequenceNumber = message.contents as number;
                this.quorum!.rejectProposal(message.clientId, sequenceNumber);
                break;

            case MessageType.BlobUploaded:
                // tslint:disable-next-line:no-floating-promises
                this.blobManager!.addBlob(message.contents as IGenericBlob);
                this.emit(MessageType.BlobUploaded, message.contents);
                break;

            case MessageType.ChunkedOp:
            case MessageType.NoOp:
                break;

            default:
                this.context!.process(message, local, context);
        }

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum!.updateMinimumSequenceNumber(message);

        this.emit("op", ...eventArgs);
    }

    private async postProcessRemoteMessage(message: ISequencedDocumentMessage, context: any) {
        const local = this._clientId === message.clientId;

        switch (message.type) {
            case MessageType.ClientJoin:
            case MessageType.ClientLeave:
            case MessageType.Propose:
            case MessageType.Reject:
            case MessageType.BlobUploaded:
            case MessageType.ChunkedOp:
            case MessageType.NoOp:
                break;
            default:
                await this.context!.postProcess(message, local, context);
        }
    }

    private submitSignal(message: any) {
        this._deltaManager!.submitSignal(JSON.stringify(message));
    }

    private processSignal(message: ISignalMessage) {
        const local = this._clientId === message.clientId;
        this.context!.processSignal(message, local);
    }
}
