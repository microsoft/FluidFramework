import {
    Browser,
    ConnectionState,
    FileMode,
    IBlobManager,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentStorageService,
    IGenericBlob,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    IUser,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import {
    IAttachMessage,
    IChaincode,
    IChaincodeModule,
    IChannel,
    IComponentDeltaHandler,
    IComponentRuntime,
    IDistributedObjectServices,
    IEnvelope,
    IHelpMessage,
    IObjectAttributes,
    IObjectMessage,
    IObjectStorageService,
    IRuntime,
    ISequencedObjectMessage,
} from "@prague/runtime-definitions";
import { Deferred, gitHashFile, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { debug } from "./debug";
import { ILegacyRuntime } from "./definitions";
import { LeaderElector } from "./leaderElection";
import { LocalChannelStorageService } from "./localChannelStorageService";
import { analyzeTasks, getLeaderCandidate } from "./taskAnalyzer";

export interface IChannelState {
    object: IChannel;
    storage: IObjectStorageService;
    connection: ChannelDeltaConnection;
}

interface IObjectServices {
    deltaConnection: ChannelDeltaConnection;
    objectStorage: IObjectStorageService;
}

// This needs to deal with transformed messages
// And also output attributes

export class ComponentHost extends EventEmitter implements IComponentDeltaHandler, ILegacyRuntime {
    public static async LoadFromSnapshot(
        componentRuntime: IComponentRuntime,
        tenantId: string,
        documentId: string,
        id: string,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: IBlobManager,
        tree: ISnapshotTree,
        chaincode: IChaincode,
        deltaManager: IDeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        branch: string,
        minimumSequenceNumber: number,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ) {
        // pkg and chaincode also probably available from the snapshot?
        const attributes = tree !== null
            ? await readAndParse<IDocumentAttributes>(storage, tree.blobs[".attributes"])
            : {
                branch: documentId,
                clients: [],
                minimumSequenceNumber: 0,
                partialOps: [],
                proposals: [],
                sequenceNumber: 0,
                values: [],
            };
        const tardisMessagesP = ComponentHost.loadTardisMessages(documentId, attributes, storage, tree);

        const runtime = new ComponentHost(
            componentRuntime,
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
            snapshotFn,
            closeFn);

        // Must always receive the component type inside of the attributes
        const tardisMessages = await tardisMessagesP;
        if (tree && tree.trees) {
            Object.keys(tree.trees).forEach((path) => {
                // Reserve space for the channel
                runtime.reserve(path);
            });

            /* tslint:disable:promise-function-async */
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

        // Start the runtime
        await runtime.start();

        return runtime;
    }

    private static async loadTardisMessages(
        id: string,
        attributes: IDocumentAttributes,
        storage: IDocumentStorageService,
        tree: ISnapshotTree): Promise<Map<string, ISequencedDocumentMessage[]>> {

        const messages: ISequencedDocumentMessage[] = tree
            ? await readAndParse<ISequencedDocumentMessage[]>(storage, tree.blobs[".messages"])
            : [];

        // Update message information based on branch details
        if (attributes.branch !== id) {
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
                if (!transformedMap.has(envelope.address)) {
                    transformedMap.set(envelope.address, []);
                }

                transformedMap.get(envelope.address).push(message);
            }
        }

        return transformedMap;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    // Interface used to access the runtime code
    public get platform(): IPlatform {
        return this._platform;
    }

    private channels = new Map<string, IChannelState>();
    private channelsDeferred = new Map<string, Deferred<IChannel>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform;
    // tslint:enable-next-line:variable-name

    private tasks: string[] = [];
    private leaderElector: LeaderElector;

    // back-compat: version decides between loading document and chaincode.
    private version: string;

    private constructor(
        private readonly componentRuntime: IComponentRuntime,
        public readonly tenantId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        private blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager,
        private quorum: IQuorum,
        private readonly chaincode: IChaincode,
        private storageService: IDocumentStorageService,
        private connectionState: ConnectionState,
        private snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void) {
        super();
    }

    public createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.componentRuntime.createAndAttachProcess(id, pkg);
    }

    public getProcess(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.componentRuntime.getProcess(id, wait);
    }

    public async request(request: IRequest): Promise<IResponse> {
        const id = request.url.substr(1);
        const value = await this.getChannel(id);
        return { mimeType: "prague/dataType", status: 200, value };
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

    public async start(): Promise<void> {
        this.verifyNotClosed();
        this._platform = await this.chaincode.run(this, null);
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

        if (this.connectionState === ConnectionState.Connected) {
            this.emit("connected", clientId);
        }
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
        this.submit(MessageType.Save, tag);
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        this.verifyNotClosed();

        const sha = gitHashFile(file.content);
        file.sha = sha;
        file.url = this.storageService.getRawUrl(sha);

        await this.blobManager.createBlob(file);
        this.submit(MessageType.BlobUploaded, await this.blobManager.createBlob(file));

        return file;
    }

    public getBlob(sha: string): Promise<IGenericBlob> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(sha);
    }

    public transform(message: ISequencedDocumentMessage, sequenceNumber: number) {
        // Allow the distributed data types to perform custom transformations
        if (message.type === MessageType.Operation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.channels.get(envelope.address);
            envelope.contents = objectDetails.object.transform(
                envelope.contents as IObjectMessage,
                objectDetails.connection.transformDocumentSequenceNumber(
                    Math.max(message.referenceSequenceNumber, this.deltaManager.minimumSequenceNumber)));
        } else {
            message.type = MessageType.NoOp;
        }

        message.referenceSequenceNumber = sequenceNumber;

        return message;
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public stop(): ITreeEntry[] {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshotInternal();
    }

    public close(): void {
        this.closeFn();
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        switch (message.type) {
            case MessageType.Attach:
                return this.prepareAttach(message, local);
            case MessageType.Operation:
                return this.prepareOp(message, local);
            default:
                return;
        }
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.messagesSinceMSNChange.push(message);

        switch (message.type) {
            case MessageType.Attach:
                this.processAttach(message, local, context);
                break;
            case MessageType.Operation:
                this.processOp(message, local, context);
                break;
            default:
                return;
        }
    }

    public updateMinSequenceNumber(msn: number) {
        let index = 0;
        for (; index < this.messagesSinceMSNChange.length; index++) {
            if (this.messagesSinceMSNChange[index].sequenceNumber > msn) {
                break;
            }
        }
        if (index !== 0) {
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
        }

        for (const [, object] of this.channels) {
            if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                object.connection.updateMinSequenceNumber(msn);
            }
        }
    }

    public snapshotInternal(): ITreeEntry[] {
        const entries = new Array<ITreeEntry>();

        this.updateMinSequenceNumber(this.deltaManager.minimumSequenceNumber);

        const transformedMessages: ISequencedDocumentMessage[] = [];
        // debug(`Transforming up to ${this.deltaManager.minimumSequenceNumber}`);
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(message, this.deltaManager.minimumSequenceNumber));
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

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            clients: [],
            minimumSequenceNumber: -101,
            partialOps: [],
            proposals: [],
            sequenceNumber: -101,
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

    public registerTasks(tasks: string[], version?: string) {
        this.verifyNotClosed();
        this.tasks = tasks;
        this.version = version;
        this.startLeaderElection();
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        this.componentRuntime.submitMessage(type, content);
    }

    private reserve(id: string) {
        if (!this.channelsDeferred.has(id)) {
            this.channelsDeferred.set(id, new Deferred<IChannel>());
        }
    }

    private prepareOp(message: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        assert(objectDetails);

        return objectDetails.connection.prepare(message, local);
    }

    private processOp(message: ISequencedDocumentMessage, local: boolean, context: any): IChannel {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        assert(objectDetails);

        /* tslint:disable:no-unsafe-any */
        objectDetails.connection.process(message, local, context);

        return objectDetails.object;
    }

    private processAttach(message: ISequencedDocumentMessage, local: boolean, context: any): IChannel {
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

        return this.channels.get(attachMessage.id).object;
    }

    private async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<IChannelState> {
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

        // Run the transformed messages through the delta connection in order to update their offsets
        // Then pass these to the loadInternal call. Moving forward we will want to update the snapshot
        // to include the range maps. And then make the objects responsible for storing any messages they
        // need to transform.
        const transformedObjectMessages = messages.map((message) => {
            return services.deltaConnection.translateToObjectMessage(message, true);
        });

        const channelDetails = await this.loadChannel(
            id,
            channelAttributes.type,
            channelAttributes.sequenceNumber,
            channelAttributes.sequenceNumber,
            transformedObjectMessages,
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
        messages: ISequencedObjectMessage[],
        services: IObjectServices,
        originBranch: string): Promise<IChannelState> {

        // Pass the transformedMessages - but the object really should be storing this
        const extension = this.chaincode.getModule(type) as IChaincodeModule;

        // TODO need to fix up the SN vs. MSN stuff here. If want to push messages to object also need
        // to store the mappings from channel ID to doc ID.
        const value = await extension.load(
            this,
            id,
            services.deltaConnection.sequenceNumber,
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

    private startLeaderElection() {
        if (this.deltaManager && this.deltaManager.clientType === Browser) {
            if (this.connected) {
                this.initLeaderElection();
            } else {
                const leaderElectionHandler = () => {
                    this.initLeaderElection();
                    this.removeListener("connected", leaderElectionHandler);
                };
                this.on("connected", leaderElectionHandler);
            }
        }
    }

    private initLeaderElection() {
        this.leaderElector = new LeaderElector(this.getQuorum(), this.clientId);
        this.leaderElector.on("newLeader", (clientId: string) => {
            debug(`New leader elected: ${clientId}`);
            this.runTaskAnalyzer();
        });
        this.leaderElector.on("leaderLeft", (clientId: string) => {
            debug(`Leader ${clientId} left`);
            this.proposeLeadership();
        });
        this.leaderElector.on("memberLeft", (clientId: string) => {
            debug(`Member ${clientId} left`);
            this.runTaskAnalyzer();
        });
        this.proposeLeadership();
    }

    private proposeLeadership() {
        if (getLeaderCandidate(this.getQuorum().getMembers()) === this.clientId) {
            this.leaderElector.proposeLeadership().then(() => {
                debug(`Proposal accepted`);
            }, (err) => {
                debug(`Proposal rejected: ${err}`);
            });
        }
    }

    /**
     * On a client joining/departure, decide whether this client is the new leader.
     * If so, calculate if there are any unhandled tasks for browsers and remote agents.
     * Emit local help message for this browser and submits a remote help message for agents.
     */
    private runTaskAnalyzer() {
        if (this.leaderElector.getLeader() === this.clientId) {
            // Analyze the current state and ask for local and remote help seperately.
            const helpTasks = analyzeTasks(this.clientId, this.getQuorum().getMembers(), this.tasks);
            if (helpTasks && (helpTasks.browser.length > 0 || helpTasks.robot.length > 0)) {
                if (helpTasks.browser.length > 0) {
                    const localHelpMessage: IHelpMessage = {
                        tasks: helpTasks.browser,
                        version: this.version,   // back-compat
                    };
                    console.log(`Requesting local help for ${helpTasks.browser}`);
                    this.emit("localHelp", localHelpMessage);
                }
                if (helpTasks.robot.length > 0) {
                    const remoteHelpMessage: IHelpMessage = {
                        tasks: helpTasks.robot,
                        version: this.version,   // back-compat
                    };
                    console.log(`Requesting remote help for ${helpTasks.robot}`);
                    this.submitMessage(MessageType.RemoteHelp, remoteHelpMessage);
                }
            }
        }
    }
}
