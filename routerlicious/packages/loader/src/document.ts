import { ICommit } from "@prague/gitresources";
import {
    ConnectionState,
    FileMode,
    IChaincode,
    IClient,
    IClientJoin,
    ICodeLoader,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentService,
    IDocumentStorageService,
    IEnvelope,
    IGenericBlob,
    IPlatform,
    IProposal,
    IRuntime,
    ISequencedDocumentMessage,
    ISequencedProposal,
    ISnapshotTree,
    ITokenService,
    ITree,
    ITreeEntry,
    IUser,
    MessageType,
    TreeEntry,
} from "@prague/runtime-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { debug } from "./debug";
import { IConnectionDetails } from "./deltaConnection";
import { DeltaManager } from "./deltaManager";
import { IQuorumSnapshot, Quorum } from "./quorum";
import { Runtime } from "./runtime";
import { readAndParse } from "./utils";

// tslint:disable:no-var-requires
const now = require("performance-now");
// tslint:enable:no-var-requires

interface IConnectResult {
    detailsP: Promise<IConnectionDetails>;

    handlerAttachedP: Promise<void>;
}

class NullChaincode implements IChaincode {
    public getModule(type: string): any {
        return null;
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<void> {
        return Promise.resolve();
    }
}

// TODO consider a name change for this. The document is likely built on top of this infrastructure
export class Document extends EventEmitter {
    private pendingClientId: string;
    private loaded = false;
    private connectionState = ConnectionState.Disconnected;
    private quorum: Quorum;
    private blobManager: BlobManager;
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

    // Active chaincode and associated runtime
    private storageService: IDocumentStorageService;
    private runtime: Runtime;

    // tslint:disable:variable-name
    private _clientId: string = "disconnected";
    private _deltaManager: DeltaManager;
    private _existing: boolean;
    private _id: string;
    private _parentBranch: string;
    private _tenantId: string;
    private _user: IUser;
    // tslint:enable:variable-name

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
        return this._user;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get clientId(): string {
        return this._clientId;
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
        private token: string,
        private platform: IPlatform,
        private service: IDocumentService,
        private codeLoader: ICodeLoader,
        tokenService: ITokenService,
        public readonly options: any) {
        super();

        const claims = tokenService.extractClaims(token);
        this._id = claims.documentId;
        this._tenantId = claims.tenantId;
        this._user = claims.user;
    }

    public async load(specifiedVersion: ICommit, connect: boolean): Promise<void> {
        const storageP = this.service.connectToStorage(this.tenantId, this.id, this.token);

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        const versionP = specifiedVersion
            ? Promise.resolve(specifiedVersion)
            : storageP.then(async (storage) => {
                const versions = await storage.getVersions(this.id, 1);
                return versions.length > 0 ? versions[1] : null;
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

        const tardisMessagesP = Promise.all([attributesP, storageP, treeP]).then(
            ([attributes, storage, tree]) => this.loadTardisMessages(attributes, storage, tree));

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
                tardisMessagesP,
                connectResult.handlerAttachedP])
            .then(async ([
                storageService,
                tree,
                version,
                attributes,
                quorum,
                blobManager,
                chaincode,
                tardisMessages]) => {

                this.quorum = quorum;
                this.storageService = storageService;
                this.blobManager = blobManager;

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

                // Instantiate channels from chaincode and stored data
                this.runtime = await Runtime.LoadFromSnapshot(
                    this.tenantId,
                    this.id,
                    this.parentBranch,
                    this.existing,
                    this.options,
                    this.clientId,
                    this.user,
                    this.blobManager,
                    chaincode,
                    tardisMessages,
                    this._deltaManager,
                    this.quorum,
                    storageService,
                    this.connectionState,
                    tree,
                    attributes.branch,
                    attributes.minimumSequenceNumber,
                    (type, contents) => this.submitMessage(type, contents),
                    (message) => this.snapshot(message),
                    () => this.close());

                // given the load is async and we haven't set the runtime variable it's possible we missed the change
                // of value. Make a call to the runtime to change the state to pick up the latest.
                this.runtime.changeConnectionState(this.connectionState, this.clientId);

                // Start delta processing once all channels are loaded
                this.runtime.ready().then(
                    () => {
                        if (connect) {
                            assert(this._deltaManager, "DeltaManager should have been created during connect call");
                            debug("Everyone ready - resuming inbound messages");
                            this._deltaManager.inbound.resume();
                            this._deltaManager.outbound.resume();
                        }
                    },
                    (error) => {
                        this.emit("error", error);
                    });

                // Internal context is fully loaded at this point
                this.loaded = true;

                debug(`Document loaded ${this.id}: ${now()} `);

                // Starts the runtime
                this.runtime.start(this.platform);
            });
    }

    /**
     * Retrieves the quorum associated with the document
     */
    public getQuorum(): Quorum {
        return this.quorum;
    }

    public on(event: "connected", listener: (clientId: string) => void): this;
    public on(event: "disconnect", listener: () => void): this;
    public on(event: "error", listener: (error: any) => void): this;
    public on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    public on(event: "pong" | "processTime", listener: (latency: number) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Modifies emit to also forward to the active runtime.
     */
    public emit(message: string | symbol, ...args: any[]): boolean {
        const superResult = super.emit(message, ...args);
        const runtimeResult = this.runtime ? this.runtime.emit(message, ...args) : true;

        return superResult && runtimeResult;
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

        // Grab the snapshot of the current state
        const snapshotSequenceNumber = this._deltaManager.referenceSequenceNumber;
        const root = this.snapshotCore();

        const deltaDetails =
            `${this._deltaManager.referenceSequenceNumber}:${this._deltaManager.minimumSequenceNumber}`;
        const message = `Commit @${deltaDetails} ${tagMessage}`;

        return this.storageService.getVersions(this.id, 1).then(async (lastVersion) => {
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

            await this.storageService.write(root, parents, message);
        });
    }

    private snapshotCore(): ITree {
        const entries: ITreeEntry[] = [];

        // Craft the .messages file for the document
        // Transform ops in the window relative to the MSN - the window is all ops between the min sequence number
        // and the current sequence number
        assert.equal(
            this._deltaManager.referenceSequenceNumber - this._deltaManager.minimumSequenceNumber,
            this.messagesSinceMSNChange.length);
        const transformedMessages: ISequencedDocumentMessage[] = [];
        debug(`Transforming up to ${this._deltaManager.minimumSequenceNumber}`);
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(message, this._deltaManager.minimumSequenceNumber));
        }
        entries.push({
            mode: FileMode.File,
            path: ".messages",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(transformedMessages),
                encoding: "utf-8",
            },
        });

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

        const channelEntries = this.runtime.snapshotInternal();
        entries.push(...channelEntries);

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            clients: [...this.quorum.getMembers()],
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
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

    /**
     * Transforms the given message relative to the provided sequence number
     */
    private transform(message: ISequencedDocumentMessage, sequenceNumber: number): ISequencedDocumentMessage {
        // Allow the distributed data types to perform custom transformations
        if (message.type === MessageType.Operation) {
            this.runtime.transform(message);
        } else {
            message.type = MessageType.NoOp;
        }

        message.referenceSequenceNumber = sequenceNumber;

        return message;
    }

    private async loadTardisMessages(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree): Promise<Map<string, ISequencedDocumentMessage[]>> {

        const messages: ISequencedDocumentMessage[] = tree
            ? await readAndParse<ISequencedDocumentMessage[]>(storage, tree.blobs[".messages"])
            : [];

        // Update message information based on branch details
        if (attributes.branch !== this.id) {
            for (const message of messages) {
                // Append branch information when transforming for the case of messages stashed with the snapshot
                if (attributes.branch) {
                    message.origin = {
                        id: attributes.branch,
                        minimumSequenceNumber: message.minimumSequenceNumber,
                        sequenceNumber: message.sequenceNumber,
                    };
                }
            }
        }

        // Make a reservation for the root object as well as all distributed objects in the snapshot
        const transformedMap = new Map<string, ISequencedDocumentMessage[]>();

        // Filter messages per distributed data type
        for (const message of messages) {
            if (message.type === MessageType.Operation) {
                const envelope = message.contents as IEnvelope;
                if (transformedMap.has(envelope.address)) {
                    transformedMap.set(envelope.address, []);
                }

                transformedMap.get(envelope.address).push(message);
            }
        }

        return transformedMap;
    }

    private async loadQuorum(
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree): Promise<Quorum> {

        let members: Array<[string, IClient]>;
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
                if (key === "code") {
                    console.log(`loadCode ${JSON.stringify(value)}`);

                    // TODO quorum needs prepare/process events
                    // Stop processing inbound messages as we transition to the new code
                    this.deltaManager.inbound.pause();
                    this.transitionRuntime(value).then(
                        () => {
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
        blobManager.loadBlobMetadata(blobs);

        return blobManager;
    }

    private async transitionRuntime(pkg: string) {
        // TODO it's possible in between the close and the resume we may be disconnected. Want to either sequence
        // those events with ops or find a better way
        // Close the previous runtime and return a snapshot of the data
        /* const snapshot = */
        await this.runtime.stop();

        // Load the new code and create a new runtime from the previous snapshot
        const chaincode = await this.loadCode(pkg);
        const newRuntime = await Runtime.LoadFromSnapshot(
            this.tenantId,
            this.id,
            this.parentBranch,
            this.existing,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            chaincode,
            new Map(),
            this._deltaManager,
            this.quorum,
            this.storageService,
            this.connectionState,
            null,
            this.id,
            this._deltaManager.minimumSequenceNumber,
            (type, contents) => this.submitMessage(type, contents),
            (message) => this.snapshot(message),
            () => this.close());
        this.runtime = newRuntime;

        // Start up the new runtime
        newRuntime.start(this.platform);
    }

    private loadCodeFromQuorum(quorum: Quorum): Promise<IChaincode> {
        if (quorum.has("code")) {
            return this.loadCode(quorum.get("code"));
        } else {
            return Promise.resolve(new NullChaincode());
        }
    }

    /**
     * Code to apply to the document has changed. Load it in now.
     */
    private async loadCode(pkg: string): Promise<IChaincode> {
        const module = await this.codeLoader.load(pkg);
        const chaincode = await module.instantiate();

        return chaincode;
    }

    private connect(attributesP: Promise<IDocumentAttributes>): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        const clientDetails = this.options ? this.options.client : null;
        this._deltaManager = new DeltaManager(this.id, this.tenantId, this.token, this.service, clientDetails);

        // Open a connection - the DeltaMananger will automatically reconnect
        const detailsP = this._deltaManager.connect("Document loading");
        this._deltaManager.on("connect", (details: IConnectionDetails) => {
            this.setConnectionState(ConnectionState.Connecting, "websocket established", details.clientId);
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
                    prepare: async (message) => {
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
        this.connectionState = value;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        if (value === ConnectionState.Connecting) {
            this.pendingClientId = context;
        } else if (value === ConnectionState.Connected) {
            this._clientId = this.pendingClientId;
        }

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.runtime.changeConnectionState(value, this.clientId);

        if (this.connectionState === ConnectionState.Connected) {
            this.emit("connected", this.pendingClientId);
        }
    }

    private submitMessage(type: MessageType, contents: any): number {
        if (this.connectionState !== ConnectionState.Connected) {
            return -1;
        }

        const clientSequenceNumber = this._deltaManager.submit(type, contents);
        return clientSequenceNumber;
    }

    private async prepareRemoteMessage(message: ISequencedDocumentMessage): Promise<any> {
        const local = this._clientId === message.clientId;

        switch (message.type) {
            case MessageType.Operation:
                return this.runtime.prepare(message, local);

            case MessageType.Attach:
                return this.runtime.prepareAttach(message, local);
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
                const join = message.contents as IClientJoin;
                this.quorum.addMember(join.clientId, join.detail);

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
                this.quorum.removeMember(message.contents);
                this.emit("clientLeave", message.contents);
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

            case MessageType.Attach:
                const attachChannel = this.runtime.processAttach(message, local, context);
                eventArgs.push(attachChannel);
                break;

            // Message contains full metadata (no content)
            case MessageType.BlobPrepared:
                this.blobManager.addBlob(message.contents);
                this.emit(MessageType.BlobPrepared, message.contents);
                break;

            case MessageType.BlobUploaded:
                // indicates that blob has been uploaded, just a flag... no blob buffer
                // message.contents is just the hash
                this.blobManager.createBlob(message.contents);
                this.emit(MessageType.BlobUploaded, message.contents);

            case MessageType.Operation:
                const operationChannel = this.runtime.process(message, local, context);
                eventArgs.push(operationChannel);
                break;

            default:
                break;
        }

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum.updateMinimumSequenceNumber(message.minimumSequenceNumber);
        this.runtime.updateMinSequenceNumber(message.minimumSequenceNumber);

        this.emit("op", ...eventArgs);
    }
}
