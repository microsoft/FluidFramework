import {
    ConnectionState,
    FileMode,
    IAttachMessage,
    IChaincode,
    IChaincodeModule,
    IChannel,
    IDistributedObjectServices,
    IDocumentStorageService,
    IEnvelope,
    IGenericBlob,
    IObjectAttributes,
    IObjectMessage,
    IObjectStorageService,
    IPlatform,
    IQuorum,
    IRuntime,
    ISave,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    IUser,
    MessageType,
    TreeEntry,
} from "@prague/runtime-definitions";
import { Deferred, gitHashFile } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { DeltaManager } from "./deltaManager";
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

export class Runtime extends EventEmitter implements IRuntime {
    public static async LoadFromSnapshot(
        tenantId: string,
        id: string,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: BlobManager,
        chaincode: IChaincode,
        tardisMessages: Map<string, ISequencedDocumentMessage[]>,
        deltaManager: DeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        tree: ISnapshotTree,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void) {

        const runtime = new Runtime(
            tenantId,
            id,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            deltaManager,
            quorum,
            chaincode,
            storage,
            connectionState,
            submitFn,
            snapshotFn,
            closeFn);

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
                    tardisMessages.has(path) ? tardisMessages.get(path) : [],
                    branch,
                    minimumSequenceNumber);
            });

            await Promise.all(loadSnapshotsP);
        }

        return runtime;
    }

    public connected: boolean;

    private channels = new Map<string, IChannelState>();
    private channelsDeferred = new Map<string, Deferred<IChannel>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();

    private constructor(
        public readonly tenantId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public readonly existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        private blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        private quorum: IQuorum,
        private chaincode: IChaincode,
        private storageService: IDocumentStorageService,
        private connectionState: ConnectionState,
        private submitFn: (type: MessageType, contents: any) => void,
        private snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void) {
        super();
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
            this.connected = true;
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        } else {
            this.connected = false;
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
            [],
            services,
            origin);

        return value;
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
    }

    public hasUnackedOps(): boolean {
        this.verifyNotClosed();

        for (const state of this.channels.values()) {
            if (state.object.dirty) {
                return true;
            }
        }

        return false;
    }

    public snapshot(message: string): Promise<void> {
        this.verifyNotClosed();

        return this.snapshotFn(message);
    }

    public save(tag: string) {
        this.verifyNotClosed();

        const message: ISave = { message: tag };
        this.submit(MessageType.Save, message);
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        this.verifyNotClosed();

        const sha = gitHashFile(file.content);
        file.sha = sha;
        file.url = this.storageService.getRawUrl(sha);

        this.blobManager.addBlob(file).then(() => this.submit(MessageType.BlobPrepared, file));
        this.blobManager.createBlob(file.content).then(() => this.submit(MessageType.BlobUploaded, sha));

        return file;
    }

    public getBlob(sha: string): Promise<IGenericBlob> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(sha);
    }

    public transform(message: ISequencedDocumentMessage) {
        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        envelope.contents = objectDetails.object.transform(
            envelope.contents as IObjectMessage,
            objectDetails.connection.transformDocumentSequenceNumber(
                Math.max(message.referenceSequenceNumber, this.deltaManager.referenceSequenceNumber)));
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public async stop(): Promise<any> {
        this.verifyNotClosed();

        this.closed = true;

        // TODO return a snapshot to pass to next chunk of code
        return null;
    }

    public close(): void {
        this.closeFn();
    }

    public updateMinSequenceNumber(msn: number) {
        for (const [, object] of this.channels) {
            if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                object.connection.updateMinSequenceNumber(msn);
            }
        }
    }

    public snapshotInternal(): ITreeEntry[] {
        const entries = new Array<ITreeEntry>();

        // Craft the .attributes file for each distributed object
        for (const [objectId, object] of this.channels) {
            // If the object isn't local - and we have received the sequenced op creating the object (i.e. it has a
            // base mapping) - then we go ahead and snapshot
            if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                const snapshot = object.object.snapshot();

                // Add in the object attributes to the returned tree
                const objectAttributes: IObjectAttributes = {
                    sequenceNumber: object.connection.minimumSequenceNumber,
                    type: object.object.type,
                };
                snapshot.entries.push({
                    mode: FileMode.File,
                    path: ".attributes",
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(objectAttributes),
                        encoding: "utf-8",
                    },
                });

                // And then store the tree
                entries.push({
                    mode: FileMode.Directory,
                    path: objectId,
                    type: TreeEntry[TreeEntry.Tree],
                    value: snapshot,
                });
            }
        }

        return entries;
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
        messages: ISequencedDocumentMessage[],
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
            messages,
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
        messages: ISequencedDocumentMessage[],
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
            messages,
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
