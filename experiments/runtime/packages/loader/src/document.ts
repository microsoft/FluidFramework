import { ICommit } from "@prague/gitresources";
import {
    ConnectionState,
    IAttachMessage,
    IChaincode,
    IChaincodeModule,
    IChannel,
    IClientJoin,
    ICodeLoader,
    IDistributedObjectServices,
    IDocumentAttributes,
    IDocumentService,
    IDocumentStorageService,
    IEnvelope,
    IObjectAttributes,
    IObjectStorageService,
    IPraguePackage,
    IProposal,
    IRuntime,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITokenService,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import now = require("performance-now");
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { debug } from "./debug";
import { IConnectionDetails } from "./deltaConnection";
import { DeltaManager } from "./deltaManager";
import { IDeltaManager } from "./deltas";
import { LocalChannelStorageService } from "./localChannelStorageService";
import { Quorum } from "./quorum";

interface IConnectResult {
    detailsP: Promise<IConnectionDetails>;

    handlerAttachedP: Promise<void>;
}

async function readAndParse<T>(storage: IDocumentStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    return JSON.parse(decoded);
}

interface IObjectServices {
    deltaConnection: ChannelDeltaConnection;
    objectStorage: IObjectStorageService;
}

interface IChannelState {
    object: IChannel;
    storage: IObjectStorageService;
    connection: ChannelDeltaConnection;
}

// TODO consider a name change for this. The document is likely built on top of this infrastructure
export class Document extends EventEmitter implements IRuntime {
    private pendingClientId: string;
    private loaded = false;
    private connectionState = ConnectionState.Disconnected;
    private quorum: Quorum;

    // Active chaincode and associated runtime
    private chaincode: IChaincode;
    private pendingAttach = new Map<string, IAttachMessage>();
    private channels = new Map<string, IChannelState>();
    private storageService: IDocumentStorageService;

    // tslint:disable:variable-name
    private _clientId: string = "disconnected";
    private _deltaManager: DeltaManager;
    private _existing: boolean;
    private _id: string;
    private _parentBranch: string;
    private _tenantId: string;
    private _user: IUser;
    // tslint:enable:variable-name

    private watches = new Map<string, Deferred<void>>();

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
        const quorumP = Promise.all([storageP, treeP]).then(([storage, tree]) => this.loadQuorum(storage, tree));

        // ...instantiate the chaincode defined on the document
        const chaincodeP = quorumP.then((quorum) => this.loadCodeFromQuorum(quorum));

        // Wait for all the loading promises to finish
        return Promise
            .all([storageP, treeP, versionP, attributesP, quorumP, chaincodeP, connectResult.handlerAttachedP])
            .then(async ([storageService, tree, version, attributes, quorum, chaincode]) => {
                this.quorum = quorum;
                this.chaincode = chaincode;
                this.storageService = storageService;

                // Instantiate channels from chaincode and stored data
                const channelStates = await this.loadChannels(this, storageService, tree, attributes);
                for (const channelState of channelStates) {
                    this.channels.set(channelState.object.id, channelState);
                }

                // Start delta processing once all channels are loaded
                const readyP = Array.from(this.channels.values()).map((value) => value.object.ready());
                Promise.all(readyP).then(
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

                // Internal context is fully loaded at this point
                this.loaded = true;

                // Now that we are loaded notify all distributed data types of connection change
                this.notifyConnectionState(this.connectionState);

                debug(`Document loaded ${this.id}: ${now()} `);
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

    public getChannel(id: string): IChannel {
        return this.channels.get(id).object;
    }

    public createChannel(id: string, type: string): IChannel {
        const extension = this.chaincode.getModule(type) as IChaincodeModule;
        return extension.create(this, id);
    }

    public attachChannel(channel: IChannel): IDistributedObjectServices {
        // Get the object snapshot and include it in the initial attach
        const snapshot = channel.snapshot();

        const message: IAttachMessage = {
            id: channel.id,
            snapshot,
            type: channel.type,
        };
        this.pendingAttach.set(channel.id, message);
        this.submitMessage(MessageType.Attach, message);

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(channel.id, null, this.storageService);
        // const entry = this.channels.get(channel.id);
        // assert.equal(entry.object, channel);
        this.channels.set(
            channel.id,
            { object: channel, connection: services.deltaConnection, storage: services.objectStorage });
        // entry.connection = services.deltaConnection;
        // entry.storage = services.objectStorage;

        return services;
    }

    public waitForChannel(id: string): Promise<void> {
        if (this.channels.has(id)) {
            return Promise.resolve();
        }

        const deferred = new Deferred<void>();
        this.watches.set(id, deferred);
        return deferred.promise;
    }

    private loadQuorum(storage: IDocumentStorageService, tree: ISnapshotTree): Quorum {
        // TODO load the stored quorum from the snapshot tree

        const quorum = new Quorum(
            0,
            [],
            [],
            [],
            (key, value) => this.submitMessage(MessageType.Propose, { key, value }),
            (sequenceNumber) => this.submitMessage(MessageType.Reject, sequenceNumber));

        quorum.on(
            "approveProposal",
            (sequenceNumber, key, value) => {
                console.log(`approve ${key}`);
                if (key === "code") {
                    console.log(`loadCode ${JSON.stringify(value)}`);
                    this.loadCode(value);
                }
            });

        return quorum;
    }

    private loadCodeFromQuorum(quorum: Quorum): Promise<IChaincode> {
        if (quorum.has("code")) {
            return this.loadCode(quorum.get("code"));
        } else {
            return null;
        }
    }

    private notifyConnectionState(value: ConnectionState) {
        // Resend all pending attach messages prior to notifying clients
        if (this.connectionState === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submitMessage(MessageType.Attach, message);
            }
        }

        // Notify connected client objects of the change
        for (const [, object] of this.channels) {
            if (object.connection) {
                object.connection.setConnectionState(value);
            }
        }
    }

    /**
     * Code to apply to the document has changed. Load it in now.
     */
    private loadCode(pkg: IPraguePackage): Promise<IChaincode> {
        // Stop processing inbound messages as we transition to the new code
        this.deltaManager.inbound.pause();

        const loadedP = this.codeLoader.load(pkg);
        const initializedP = loadedP.then(async (module) => {
            // TODO transitions, etc... for now unload existing chaincode if it exists
            if (this.chaincode) {
                await this.chaincode.close();
            }

            const runtime = null;
            const chaincode = await module.instantiate(runtime);
            return { chaincode, runtime };
        });

        return initializedP.then(
            (value) => {
                this.chaincode = value.chaincode;
                this.deltaManager.inbound.resume();
                this.chaincode.run(this);
                return this.chaincode;
            },
            (error) => {
                // I believe this is a fatal problem - or we need to keep trying
                console.error(error);
                return Promise.reject(error);
            });
    }

    /**
     * Loads in all the distributed objects contained in the header
     */
    private async loadChannels(
        runtime: IRuntime,
        storage: IDocumentStorageService,
        tree: ISnapshotTree,
        attributes: IDocumentAttributes): Promise<IChannelState[]> {

        const channelsP = new Array<Promise<IChannelState>>();
        if (tree) {
            // tslint:disable-next-line:forin
            for (const path in tree.trees) {
                const channelP = this.loadSnapshotChannel(runtime, path, tree.trees[path], attributes, storage);
                channelsP.push(channelP);
            }
        }

        const channels = await Promise.all(channelsP);
        debug(`objectsLoaded ${this.id}: ${now()} `);

        return channels;
    }

    private async loadSnapshotChannel(
        runtime: IRuntime,
        id: string,
        tree: ISnapshotTree,
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService): Promise<IChannelState> {

        const channelAttributes = await readAndParse<IObjectAttributes>(storage, tree.blobs[".attributes"]);
        const services = this.getObjectServices(id, tree, storage);
        services.deltaConnection.setBaseMapping(channelAttributes.sequenceNumber, attributes.minimumSequenceNumber);

        return this.loadChannel(
            runtime,
            id,
            channelAttributes.type,
            channelAttributes.sequenceNumber,
            channelAttributes.sequenceNumber,
            services,
            attributes.branch);
    }

    private async loadChannel(
        runtime: IRuntime,
        id: string,
        type: string,
        sequenceNumber: number,
        minSequenceNumber: number,
        services: IObjectServices,
        originBranch: string): Promise<IChannelState> {

        // Pass the transformedMessages - but the object really should be storing this
        const extension = this.chaincode.getModule(type) as IChaincodeModule;

        // TODO need to fix up the SN vs. MSN stuff here. If want to push messages to object also need
        // to store the mappings from channel ID to doc ID.
        const value = await extension.load(
            runtime,
            id,
            sequenceNumber,
            minSequenceNumber,
            services,
            originBranch);

        return { object: value, storage: services.objectStorage, connection: services.deltaConnection };
    }

    private getObjectServices(
        id: string,
        tree: ISnapshotTree,
        storage: IDocumentStorageService): IObjectServices {

        const deltaConnection = new ChannelDeltaConnection(
            id,
            this.connectionState,
            (message) => {
                const envelope: IEnvelope = { address: id, contents: message };
                this.submitMessage(MessageType.Operation, envelope);
            });
        const objectStorage = new ChannelStorageService(tree, storage);

        return {
            deltaConnection,
            objectStorage,
        };
    }

    private connect(attributesP: Promise<IDocumentAttributes>): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        const clientDetails = this.options ? this.options.client : null;
        this._deltaManager = new DeltaManager(this.id, this.tenantId, this.service, clientDetails, true);

        // Open a connection - the DeltaMananger will automatically reconnect
        const detailsP = this._deltaManager.connect("Document loading", this.token);
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

        this.notifyConnectionState(value);

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
                const envelope = message.contents as IEnvelope;
                const objectDetails = this.channels.get(envelope.address);
                return objectDetails.connection.prepare(message, local);

            case MessageType.Attach:
                if (local) {
                    break;
                }

                const attachMessage = message.contents as IAttachMessage;

                // create storage service that wraps the attach data
                const localStorage = new LocalChannelStorageService(attachMessage.snapshot);
                const connection = new ChannelDeltaConnection(
                    attachMessage.id,
                    this.connectionState,
                    (submitMessage) => {
                        const submitEnvelope: IEnvelope = { address: attachMessage.id, contents: submitMessage };
                        this.submitMessage(MessageType.Operation, submitEnvelope);
                    });

                // Document sequence number references <= message.sequenceNumber should map to the object's 0
                // sequence number. We cap to the MSN to keep a tighter window and because no references should
                // be below it.
                connection.setBaseMapping(0, message.minimumSequenceNumber);

                const services: IObjectServices = {
                    deltaConnection: connection,
                    objectStorage: localStorage,
                };

                const origin = message.origin ? message.origin.id : this.id;
                const value = await this.loadChannel(
                    this,
                    attachMessage.id,
                    attachMessage.type,
                    0,
                    0,
                    services,
                    origin);

                return value;
        }
    }

    private processRemoteMessage(message: ISequencedDocumentMessage, context: any) {
        const local = this._clientId === message.clientId;

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
                const attachMessage = message.contents as IAttachMessage;
                // If a non-local operation then go and create the object - otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(attachMessage.id));
                    this.pendingAttach.delete(attachMessage.id);

                    // Document sequence number references <= message.sequenceNumber should map to the
                    // object's 0 sequence number. We cap to the MSN to keep a tighter window and because
                    // no references should be below it.
                    this.channels.get(attachMessage.id).connection.setBaseMapping(
                        0,
                        message.minimumSequenceNumber);
                } else {
                    const channelState = context as IChannelState;
                    this.channels.set(channelState.object.id, channelState);
                    if (this.watches.has(channelState.object.id)) {
                        this.watches.get(channelState.object.id).resolve();
                        this.watches.delete(channelState.object.id);
                    }
                }

                break;

            case MessageType.Operation:
                const envelope = message.contents as IEnvelope;
                const objectDetails = this.channels.get(envelope.address);
                objectDetails.connection.process(message, local, context);

                break;

            default:
                break;
        }

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum.updateMinimumSequenceNumber(message.minimumSequenceNumber);
    }
}
