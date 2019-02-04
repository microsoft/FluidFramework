import {
    ConnectionState,
    FileMode,
    IChaincodeFactory,
    IChunkedOp,
    IClientJoin,
    ICodeLoader,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentService,
    IDocumentStorageService,
    IGenericBlob,
    IHost,
    IProposal,
    IRequest,
    IResponse,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISequencedProposal,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    IUser,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import { ICommit } from "@prague/gitresources";
import { buildHierarchy, flatten, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { Context } from "./context";
import { debug } from "./debug";
import { IConnectionDetails } from "./deltaConnection";
import { DeltaManager } from "./deltaManager";
import { NullChaincode } from "./nullChaincode";
import { IQuorumSnapshot, Quorum } from "./quorum";

interface IConnectResult {
    detailsP: Promise<IConnectionDetails>;

    handlerAttachedP: Promise<void>;
}

interface IBufferedChunk {
    type: MessageType;

    content: string;
}

export class Container extends EventEmitter {
    public static async Load(
        id: string,
        containerHost: IHost,
        service: IDocumentService,
        codeLoader: ICodeLoader,
        options: any,
    ): Promise<Container> {
        const container = new Container(
            id,
            options,
            containerHost,
            service,
            codeLoader);

        // TODO need to crack the version and connection flag out of the URL
        await container.load(null, true);

        return container;
    }

    public runtime: any = null;

    private pendingClientId: string;
    private loaded = false;
    private quorum: Quorum;
    private blobManager: BlobManager;
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService;

    // tslint:disable:variable-name
    private _clientId: string = "disconnected";
    private _deltaManager: DeltaManager;
    private _existing: boolean;
    private _id: string;
    private _parentBranch: string;
    private _tenantId: string;
    private _connectionState = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    private context: Context;
    private pkg: string = null;

    // Local copy of incomplete received chunks.
    private chunkMap = new Map<string, string[]>();

    // Local copy of sent but unacknowledged chunks.
    private unackedChunkedMessages: Map<number, IBufferedChunk> = new Map<number, IBufferedChunk>();

    public get tenantId(): string {
        return this._tenantId;
    }

    public get id(): string {
        return this._id;
    }

    public get deltaManager(): IDeltaManager {
        return this._deltaManager;
    }

    public get user(): IUser {
        return this.containerHost.user;
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get clientId(): string {
        return this._clientId;
    }

    public get chaincodePackage(): string {
        return this.pkg;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this._existing;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this._parentBranch;
    }

    constructor(
        id: string,
        public readonly options: any,
        private containerHost: IHost,
        private service: IDocumentService,
        private codeLoader: ICodeLoader,
    ) {
        super();

        const [tenantId, documentId] = id.split("/");
        this._tenantId = decodeURIComponent(tenantId);
        this._id = decodeURI(documentId);
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): Quorum {
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

    public async snapshot(tagMessage: string): Promise<void> {
        // TODO: support for branch snapshots. For now simply no-op when a branch snapshot is requested
        if (this.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        // Stop inbound message processing while we complete the snapshot
        // TODO I should verify that when paused, if we are in the middle of a prepare, we will not process the message
        this.deltaManager.inbound.pause();
        await this.snapshotCore(tagMessage).catch((error) => debug("Snapshot error", error));
        this.deltaManager.inbound.resume();
    }

    public async request(path: IRequest): Promise<IResponse> {
        if (!path) {
            return { mimeType: "prague/container", status: 200, value: this };
        }

        return this.context.request(path);
    }

    private async snapshotCore(tagMessage: string) {
        // NOTE I believe I did the explicit then here so that the snapshot held the turn until it got the data
        // it needed

        // Snapshots base document state and currently running context
        const root = this.snapshotBase();
        const componentEntries = await this.context.snapshot(tagMessage);

        // And then combine
        if (componentEntries) {
            root.entries.push(...componentEntries.entries);
        }

        // Generate base snapshot message
        const snapshotSequenceNumber = this._deltaManager.referenceSequenceNumber;
        const deltaDetails =
            `${this._deltaManager.referenceSequenceNumber}:${this._deltaManager.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storageService.getVersions(this.id, 1);

        // Pull the sequence number stored with the previous version
        let sequenceNumber = 0;
        if (lastVersion.length > 0) {
            const attributesAsString = await this.storageService.getContent(lastVersion[0], ".attributes");
            const decoded = Buffer.from(attributesAsString, "base64").toString();
            const attributes = JSON.parse(decoded) as IDocumentAttributes;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Retrieve all deltas from sequenceNumber to snapshotSequenceNumber. Range is exclusive so we increment
        // the snapshotSequenceNumber by 1 to include it.
        // TODO We likely then want to filter the operation list to each component to use in its snapshot
        const deltas = await this._deltaManager.getDeltas(sequenceNumber, snapshotSequenceNumber + 1);
        const parents = lastVersion.length > 0 ? [lastVersion[0].sha] : [];
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
        await this.storageService.write(root, parents, message, "");
    }

    private async load(specifiedVersion: ICommit, connect: boolean): Promise<void> {
        // TODO connect to storage needs the token provider
        const storageP = this.service.connectToStorage(this.tenantId, this.id, this.containerHost.tokenProvider);

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        const versionP = specifiedVersion
            ? Promise.resolve(specifiedVersion)
            : storageP.then(async (storage) => {
                const versions = await storage.getVersions(this.id, 1);
                return versions.length > 0 ? versions[0] : null;
            });

        // Get the snapshot tree
        const treeP = Promise.all([storageP, versionP]).then(
            ([storage, version]) => version ? storage.getSnapshotTree(version) : null);

        const attributesP = Promise.all([storageP, treeP]).then<IDocumentAttributes>(
            ([storage, tree]) => {
                return tree !== null
                    ? readAndParse<IDocumentAttributes>(storage, tree.blobs[".attributes"])
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
        const connectResult: IConnectResult = connect
            ? this.connect(attributesP)
            : { detailsP: Promise.resolve(null), handlerAttachedP: Promise.resolve() };

        // ...load in the existing quorum
        const quorumP = Promise.all([attributesP, storageP, treeP]).then(
            ([attributes, storage, tree]) => this.loadQuorum(attributes, storage, tree));

        // ...instantiate the chaincode defined on the document
        const chaincodeP = quorumP.then((quorum) => this.loadCodeFromQuorum(quorum));

        const blobManagerP = Promise.all([storageP, treeP]).then(
            ([storage, tree]) => this.loadBlobManager(storage, tree));

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

                // Initialize document details - if loading a snapshot use that - otherwise we need to wait on
                // the initial details
                if (version) {
                    this._existing = true;
                    this._parentBranch = attributes.branch !== this.id ? attributes.branch : null;
                } else {
                    const details = await connectResult.detailsP;
                    this._existing = details.existing;
                    this._parentBranch = details.parentBranch;
                }

                this.context = await Context.Load(
                    this,
                    chaincode.chaincode,
                    tree,
                    new Map(),
                    attributes,
                    this.blobManager,
                    this._deltaManager,
                    this.quorum,
                    storageService,
                    (err) => debug("Context error", err),
                    (type, contents) => this.submitMessage(type, contents),
                    (message) => this.snapshot(message),
                    () => this.close());
                this.context.changeConnectionState(this.connectionState, this.clientId);

                if (connect) {
                    assert(this._deltaManager, "DeltaManager should have been created during connect call");
                    debug("Everyone ready - resuming inbound messages");
                    this._deltaManager.inbound.resume();
                    this._deltaManager.outbound.resume();
                }

                // Internal context is fully loaded at this point
                this.loaded = true;

                /* tslint:disable:no-unsafe-any */
                debug(`Document loaded ${this.id}: ${Date.now} `);
            });
    }

    private snapshotBase(): ITree {
        const entries: ITreeEntry[] = [];

        const blobMetaData = this.blobManager.getBlobMetadata();
        entries.push({
            mode: FileMode.File,
            path: ".blobs",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(blobMetaData),
                encoding: "utf-8",
            },
        });

        const quorumSnapshot = this.quorum.snapshot();
        entries.push({
            mode: FileMode.File,
            path: "quorum",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(quorumSnapshot),
                encoding: "utf-8",
            },
        });

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            clients: [...this.quorum.getMembers()],
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            partialOps: [...this.chunkMap],
            proposals: [],
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
            values: [],
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
        };

        return root;
    }

    private async loadQuorum(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree): Promise<Quorum> {

        let members: Array<[string, ISequencedClient]>;
        let proposals: Array<[number, ISequencedProposal, string[]]>;
        let values: Array<[string, any]>;

        if (tree && tree.blobs.quorum) {
            const quorumSnapshot = await readAndParse<IQuorumSnapshot>(storage, tree.blobs.quorum);
            members = quorumSnapshot.members;
            proposals = quorumSnapshot.proposals;
            values = quorumSnapshot.values;
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
                console.log(`approve ${key}`);
                if (key === "code2") {
                    console.log(`loadCode ${JSON.stringify(value)}`);

                    // Stop processing inbound messages as we transition to the new code
                    this.deltaManager.inbound.pause();
                    this.transitionRuntime(value).then(
                        () => {
                            // Resume once transition is complete
                            this.deltaManager.inbound.resume();
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
            ? await readAndParse<IGenericBlob[]>(storage, tree.blobs[".blobs"])
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

        const previousContextState = await this.context.stop();
        let snapshotTree: ISnapshotTree;
        const blobs = new Map();
        if (previousContextState) {
            const flattened = flatten(previousContextState.entries, blobs);
            snapshotTree = buildHierarchy(flattened);
        } else {
            snapshotTree = { sha: null, blobs: {}, commits: {}, trees: {} };
        }

        const attributes: IDocumentAttributes = {
            branch: this.id,
            clients: null,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            partialOps: null,
            proposals: null,
            sequenceNumber: null,
            values: null,
        };

        const newContext = await Context.Load(
            this,
            chaincode,
            snapshotTree,
            blobs,
            attributes,
            this.blobManager,
            this._deltaManager,
            this.quorum,
            this.storageService,
            (err) => debug("Context error", err),
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.snapshot(message),
            () => this.close());
        this.context = newContext;

        this.pkg = pkg;
        this.emit("contextChanged", this.pkg);
    }

    private async loadCodeFromQuorum(quorum: Quorum): Promise<{ pkg: string, chaincode: IChaincodeFactory }> {
        const pkg = quorum.has("code2") ? quorum.get("code2") : null;
        const chaincode = await this.loadCode(pkg);

        return { chaincode, pkg };
    }

    /**
     * Loads the code for the provided package
     */
    private async loadCode(pkg: string): Promise<IChaincodeFactory> {
        return pkg ? this.codeLoader.load(pkg) : new NullChaincode();
    }

    private connect(attributesP: Promise<IDocumentAttributes>): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        const clientDetails = this.options ? this.options.client : null;
        this._deltaManager = new DeltaManager(
            this.id,
            this.tenantId,
            this.containerHost.tokenProvider,
            this.service,
            clientDetails);

        // Open a connection - the DeltaMananger will automatically reconnect
        const detailsP = this._deltaManager.connect("Document loading");
        this._deltaManager.on("connect", (details: IConnectionDetails) => {
            this.setConnectionState(ConnectionState.Connecting, "websocket established", details.clientId);
            this.sendUnackedChunks();
        });

        this._deltaManager.on("disconnect", (nack: boolean) => {
            this.setConnectionState(ConnectionState.Disconnected, `nack === ${nack}`);
            this.emit("disconnect");
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
            this._deltaManager.attachOpHandler(
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
                });
            });

        return { detailsP, handlerAttachedP };
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

        debug(`Changing from ${ConnectionState[this.connectionState]} to ${ConnectionState[value]}: ${reason}`);
        this._connectionState = value;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        if (value === ConnectionState.Connecting) {
            this.pendingClientId = context;
        } else if (value === ConnectionState.Connected) {
            this._deltaManager.disableReadonlyMode();
            this._clientId = this.pendingClientId;
        }

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.context.changeConnectionState(value, this.clientId);

        if (this.connectionState === ConnectionState.Connected) {
            this.emit("connected", this.pendingClientId);
        }
    }

    private sendUnackedChunks() {
        for (const message of this.unackedChunkedMessages) {
            console.log(`Resending unacked chunks!`);
            this.submitChunkedMessage(
                message[1].type,
                message[1].content,
                this._deltaManager.maxMessageSize);
        }
    }

    private submitMessage(type: MessageType, contents: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            return -1;
        }

        const serializedContent = JSON.stringify(contents);
        const maxOpSize = this._deltaManager.maxMessageSize;

        let clientSequenceNumber: number;
        if (serializedContent.length <= maxOpSize) {
            clientSequenceNumber = this._deltaManager.submit(type, serializedContent);
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
        let clientSequenceNumber;
        for (let i = 1; i <= chunkN; i = i + 1) {
            const chunkedOp: IChunkedOp = {
                chunkId: i,
                contents: content.substr(offset, maxOpSize),
                originalType: type,
                totalChunks: chunkN,
            };
            offset += maxOpSize;
            clientSequenceNumber = this._deltaManager.submit(MessageType.ChunkedOp, JSON.stringify(chunkedOp));
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
                } else  {
                    if (local) {
                        const clientSeqNumber = message.clientSequenceNumber;
                        if (this.unackedChunkedMessages.has(clientSeqNumber)) {
                            this.unackedChunkedMessages.delete(clientSeqNumber);
                        }
                    }
                    return this.prepareRemoteMessage(message);
                }

            default:
                return this.context.prepare(message, local);
        }
    }

    private prepareRemoteChunkedMessage(message: ISequencedDocumentMessage): boolean {
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

    private processRemoteMessage(message: ISequencedDocumentMessage, context: any) {
        const local = this._clientId === message.clientId;

        // Add the message to the list of pending messages so we can transform them during a snapshot
        // Reset the list of messages we have received since the min sequence number changed
        this.messagesSinceMSNChange.push(message);
        let index = 0;

        // tslint:disable-next-line:no-increment-decrement
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
                this.quorum.addMember(join.clientId, member);

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
                this.quorum.removeMember(clientId);
                this.emit("clientLeave", clientId);
                break;

            case MessageType.Propose:
                const proposal = message.contents as IProposal;
                this.quorum.addProposal(
                    proposal.key,
                    proposal.value,
                    message.sequenceNumber,
                    local,
                    message.clientSequenceNumber);
                break;

            case MessageType.Reject:
                const sequenceNumber = message.contents as number;
                this.quorum.rejectProposal(message.clientId, sequenceNumber);
                break;

            case MessageType.BlobUploaded:
                // tslint:disable-next-line:no-floating-promises
                this.blobManager.addBlob(message.contents);
                this.emit(MessageType.BlobUploaded, message.contents);
                break;

            case MessageType.ChunkedOp:
            case MessageType.NoOp:
                break;

            default:
                this.context.process(message, local, context);
        }

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum.updateMinimumSequenceNumber(message);

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
                await this.context.postProcess(message, local, context);
        }
    }
}
