import {
    ConnectionState,
    IAttachMessage,
    IChaincode,
    IChaincodeModule,
    IChannel,
    IDistributedObjectServices,
    IDocumentStorageService,
    IEnvelope,
    IObjectAttributes,
    IObjectStorageService,
    IPlatform,
    IRuntime,
    ISequencedDocumentMessage,
    ISnapshotTree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { LocalChannelStorageService } from "./localChannelStorageService";
import { readAndParse } from "./utils";

export interface IChannelState {
    object: IChannel;
    storage: IObjectStorageService;
    connection: ChannelDeltaConnection;
}

interface IObjectServices {
    deltaConnection: ChannelDeltaConnection;
    objectStorage: IObjectStorageService;
}

export class Runtime implements IRuntime {
    public static async LoadFromSnapshot(
        id: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        chaincode: IChaincode,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        tree: ISnapshotTree,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void): Promise<Runtime> {

        const runtime = new Runtime(
            id,
            existing,
            options,
            clientId,
            user,
            chaincode,
            storage,
            connectionState,
            submitFn);

        if (tree) {
            Object.keys(tree.trees).forEach((path) => {
                // Reserve space for the channel
                runtime.reserve(path);
            });

            const loadSnapshotsP = Object.keys(tree.trees).map((path) => {
                return runtime.loadSnapshotChannel(
                    runtime,
                    path,
                    tree.trees[path],
                    storage,
                    branch,
                    minimumSequenceNumber);
            });

            await Promise.all(loadSnapshotsP);
        }

        return runtime;
    }

    private channels = new Map<string, IChannelState>();
    private channelsDeferred = new Map<string, Deferred<IChannel>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();

    private constructor(
        public id: string,
        public existing: boolean,
        public options: any,
        public clientId: string,
        public user: IUser,
        private chaincode: IChaincode,
        private storageService: IDocumentStorageService,
        private connectionState: ConnectionState,
        private submitFn: (type: MessageType, contents: any) => void) {
    }

    public getChannel(id: string): Promise<IChannel> {
        this.verifyNotClosed();

        // TODO we don't assume any channels (even root) in the runtime. If you request a channel that doesn't exist
        // we will never resolve the promise. May want a flag to getChannel that doesn't wait for the promise if
        // it doesn't exist
        if (!this.channelsDeferred.has(id)) {
            this.channelsDeferred.set(id, new Deferred<IChannel>());
        }

        return this.channelsDeferred.get(id).promise;
    }

    public createChannel(id: string, type: string): IChannel {
        this.verifyNotClosed();

        const extension = this.chaincode.getModule(type) as IChaincodeModule;
        const channel = extension.create(this, id);
        this.channels.set(id, { object: channel, connection: null, storage: null });

        if (this.channelsDeferred.has(id)) {
            this.channelsDeferred.get(id).resolve(channel);
        } else {
            const deferred = new Deferred<IChannel>();
            deferred.resolve(channel);
            this.channelsDeferred.set(id, deferred);
        }

        return channel;
    }

    public attachChannel(channel: IChannel): IDistributedObjectServices {
        this.verifyNotClosed();

        // Get the object snapshot and include it in the initial attach
        const snapshot = channel.snapshot();

        const message: IAttachMessage = {
            id: channel.id,
            snapshot,
            type: channel.type,
        };
        this.pendingAttach.set(channel.id, message);
        this.submit(MessageType.Attach, message);

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(channel.id, null, this.storageService);

        const entry = this.channels.get(channel.id);
        assert.equal(entry.object, channel);
        entry.connection = services.deltaConnection;
        entry.storage = services.objectStorage;

        return services;
    }

    public async ready(): Promise<void> {
        this.verifyNotClosed();

        await Promise.all(Array.from(this.channels.values()).map((value) => value.object.ready()));
    }

    public start(platform: IPlatform) {
        this.verifyNotClosed();

        this.chaincode.run(this, platform);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        if (value === this.connectionState) {
            return;
        }

        this.connectionState = value;
        this.clientId = clientId;

        // Resend all pending attach messages prior to notifying clients
        if (value === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [, object] of this.channels) {
            if (object.connection) {
                object.connection.setConnectionState(value);
            }
        }
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        assert(objectDetails);

        return objectDetails.connection.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        assert(objectDetails);

        objectDetails.connection.process(message, local, context);
    }

    public processAttach(message: ISequencedDocumentMessage, local: boolean, context: IChannelState) {
        this.verifyNotClosed();

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
            if (this.channelsDeferred.has(channelState.object.id)) {
                this.channelsDeferred.get(channelState.object.id).resolve(channelState.object);
            } else {
                const deferred = new Deferred<IChannel>();
                deferred.resolve(channelState.object);
                this.channelsDeferred.set(channelState.object.id, deferred);
            }
        }
    }

    public async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<IChannelState> {
        this.verifyNotClosed();

        if (local) {
            return;
        }

        const attachMessage = message.contents as IAttachMessage;

        // create storage service that wraps the attach data
        const localStorage = new LocalChannelStorageService(attachMessage.snapshot);
        const connection = new ChannelDeltaConnection(
            attachMessage.id,
            this.connectionState,
            (submitMessage) => {
                const submitEnvelope: IEnvelope = { address: attachMessage.id, contents: submitMessage };
                this.submit(MessageType.Operation, submitEnvelope);
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
            attachMessage.id,
            attachMessage.type,
            0,
            0,
            services,
            origin);

        return value;
    }

    public async close(): Promise<any> {
        this.verifyNotClosed();

        this.closed = true;

        // TODO return a snapshot to pass to next chunk of code
        return null;
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        this.submitFn(type, content);
    }

    private reserve(id: string) {
        if (!this.channelsDeferred.has(id)) {
            this.channelsDeferred.set(id, new Deferred<IChannel>());
        }
    }

    private async loadSnapshotChannel(
        runtime: IRuntime,
        id: string,
        tree: ISnapshotTree,
        storage: IDocumentStorageService,
        branch: string,
        minimumSequenceNumber: number): Promise<void> {

        const channelAttributes = await readAndParse<IObjectAttributes>(storage, tree.blobs[".attributes"]);
        const services = this.getObjectServices(id, tree, storage);
        services.deltaConnection.setBaseMapping(channelAttributes.sequenceNumber, minimumSequenceNumber);

        const channelDetails = await this.loadChannel(
            id,
            channelAttributes.type,
            channelAttributes.sequenceNumber,
            channelAttributes.sequenceNumber,
            services,
            branch);

        assert(!this.channels.has(id));
        this.channels.set(id, channelDetails);
        this.channelsDeferred.get(id).resolve(channelDetails.object);
    }

    private async loadChannel(
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
            this,
            id,
            sequenceNumber,
            minSequenceNumber,
            [], // FIX ME!
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
                this.submit(MessageType.Operation, envelope);
            });
        const objectStorage = new ChannelStorageService(tree, storage);

        return {
            deltaConnection,
            objectStorage,
        };
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
