import { ISharedObjectExtension } from "@prague/api-definitions";
import {
    ConnectionState,
    FileMode,
    IBlobManager,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import {
    IAttachMessage,
    IChannel,
    IChannelAttributes,
    IComponent,
    IComponentContext,
    IComponentRuntime,
    IDistributedObjectServices,
    IEnvelope,
    IInboundSignalMessage,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { Deferred, gitHashFile, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { debug } from "./debug";
import { LocalChannelStorageService } from "./localChannelStorageService";

interface IChannelState {
    object: IChannel;
    storage: IObjectStorageService;
    connection: ChannelDeltaConnection;
    baseSha: string;
}

interface IObjectServices {
    deltaConnection: ChannelDeltaConnection;
    objectStorage: IObjectStorageService;
    baseSha: string;
}

export class ServicePlatform extends EventEmitter implements IPlatform {
    private readonly qi: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.qi = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        return this.qi.has(id) ? this.qi.get(id) : null;
    }

    public detach() {
        return;
    }
}

export interface ISharedObjectRegistry {
    // TODO consider making this async. A consequence is that either the creation of a distributed data type
    // is async or we need a new API to split the synchronous vs. asynchronous creation.
    get(name: string): ISharedObjectExtension;
}

/**
 * Base component class
 */
export class ComponentRuntime extends EventEmitter implements IComponentRuntime {
    public static async Load(
        context: IComponentContext,
        registry: ISharedObjectRegistry,
    ) {
        const tree = context.baseSnapshot;
        const runtime = new ComponentRuntime(
            context,
            context.documentId,
            context.id,
            context.parentBranch,
            context.existing,
            context.options,
            context.blobManager,
            context.deltaManager,
            context.getQuorum(),
            context.storage,
            context.snapshotFn,
            context.closeFn,
            registry);

        // Must always receive the component type inside of the attributes
        if (tree && tree.trees) {
            Object.keys(tree.trees).forEach((path) => {
                // Reserve space for the channel
                runtime.reserve(path);
            });

            /* tslint:disable:promise-function-async */
            const loadSnapshotsP = Object.keys(tree.trees).map((path) => {
                return runtime.loadSnapshotChannel(
                    path,
                    tree.trees[path],
                    context.storage,
                    context.branch);
            });

            await Promise.all(loadSnapshotsP);
        }

        return runtime;
    }

    public get connected(): boolean {
        return this.componentContext.connected;
    }

    public get leader(): boolean {
        return this.componentContext.leader;
    }

    // Interface used to access the runtime code
    public get platform(): IPlatform {
        return this._platform;
    }

    public get clientId(): string {
        return this.componentContext.clientId;
    }

    public get clientType(): string {
        return this.componentContext.clientType;
    }

    public get loader(): ILoader {
        return this.componentContext.loader;
    }

    private channels = new Map<string, IChannelState>();
    private channelsDeferred = new Map<string, Deferred<IChannel>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: (request: IRequest) => Promise<IResponse>;

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform;
    // tslint:enable-next-line:variable-name

    private constructor(
        private readonly componentContext: IComponentContext,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        private blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private quorum: IQuorum,
        private storageService: IDocumentStorageService,
        private snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void,
        private registry: ISharedObjectRegistry) {
        super();
        this.attachListener();
    }

    public createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.componentContext.createAndAttachComponent(id, pkg);
    }

    public getComponentRuntime(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.componentContext.getComponent(id, wait);
    }

    /**
     * Opens the component with the given 'id'.
     */
    public async openComponent<T extends IComponent>(
        id: string,
        wait: boolean,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        const runtime = await this.componentContext.getComponent(id, wait);
        const component = await runtime.request({ url: "/" });

        if (component.status !== 200 || component.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const result = component.value as T;
        await result.attach(new ServicePlatform(services));

        return result;
    }

    public async request(request: IRequest): Promise<IResponse> {
        // Parse out the leading slash
        const id = request.url.substr(1);

        // Check for a data type reference first
        if (this.channelsDeferred.has(id)) {
            const value = await this.channelsDeferred.get(id).promise;
            return { mimeType: "prague/dataType", status: 200, value };
        }

        // Otherwise defer to an attached request handler
        if (!this.requestHandler) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            return this.requestHandler(request);
        }
    }

    public registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>) {
        this.requestHandler = handler;
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

        const extension = this.registry.get(type);
        if (!extension) {
            throw new Error(`Channel Extension ${type} not registered`);
        }
        const channel = extension.create(this, id);
        this.channels.set(
            id,
            { baseSha: null, object: channel, connection: null, storage: null });

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

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

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

        if (value === ConnectionState.Connected) {
            this.emit("connected", clientId);
        }
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
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
        file.blobId = sha;
        file.url = this.storageService.getRawUrl(sha);

        const blob = await this.blobManager.createBlob(file);
        this.submit(MessageType.BlobUploaded, blob);

        return file;
    }

    public getBlob(sha: string): Promise<IGenericBlob> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(sha);
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public stop(): ITreeEntry[] {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshotInternal();
    }

    public async close(): Promise<void> {
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
        let target: IChannel = null;
        switch (message.type) {
            case MessageType.Attach:
                target = this.processAttach(message, local, context);
                break;
            case MessageType.Operation:
                target = this.processOp(message, local, context);
                break;
            default:
        }

        this.emit("op", message, target);
    }

    public processSignal(message: IInboundSignalMessage, local: boolean) {
        this.emit("signal", message, local);
    }

    public snapshotInternal(): ITreeEntry[] {
        const entries = new Array<ITreeEntry>();

        // Craft the .attributes file for each distributed object
        for (const [objectId, object] of this.channels) {
            // If the object isn't local - and we have received the sequenced op creating the object (i.e. it has a
            // base mapping) - then we go ahead and snapshot
            if (!object.object.isLocal()) {
                const snapshot = object.object.snapshot();

                // Add in the object attributes to the returned tree
                const objectAttributes: IChannelAttributes = {
                    snapshotFormatVersion: object.object.snapshotFormatVersion,
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

                // If baseSha exists then the previous snapshot is still valid
                if (object.baseSha) {
                    snapshot.sha = object.baseSha;
                }

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

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        return this.componentContext.submitSignal(type, content);
    }

    private submit(type: MessageType, content: any): number {
        this.verifyNotClosed();
        return this.componentContext.submitMessage(type, content);
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

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: envelope.contents,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: message.type,
        };

        return objectDetails.connection.prepare(transformed, local);
    }

    private processOp(message: ISequencedDocumentMessage, local: boolean, context: any): IChannel {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const objectDetails = this.channels.get(envelope.address);
        assert(objectDetails);

        // Clear base sha since the channel is now dirty
        objectDetails.baseSha = null;

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: envelope.contents,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: message.type,
        };
        objectDetails.connection.process(transformed, local, context);

        return objectDetails.object;
    }

    private processAttach(message: ISequencedDocumentMessage, local: boolean, context: any): IChannel {
        this.verifyNotClosed();

        const attachMessage = message.contents as IAttachMessage;

        // If a non-local operation then go and create the object - otherwise mark it as officially attached.
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.pendingAttach.delete(attachMessage.id);
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
            this.componentContext.connectionState,
            (submitMessage) => {
                const submitEnvelope: IEnvelope = {
                    address: attachMessage.id,
                    contents: submitMessage,
                };
                return this.submit(MessageType.Operation, submitEnvelope);
            });

        const services: IObjectServices = {
            baseSha: null,
            deltaConnection: connection,
            objectStorage: localStorage,
        };

        const origin = message.origin ? message.origin.id : this.documentId;

        const value = await this.loadChannel(
            attachMessage.id,
            attachMessage.type,
            undefined,
            message.minimumSequenceNumber,
            services,
            origin);

        return value;
    }

    private async loadSnapshotChannel(
        id: string,
        tree: ISnapshotTree,
        storage: IDocumentStorageService,
        branch: string): Promise<void> {

        const channelAttributes = await readAndParse<IChannelAttributes>(storage, tree.blobs[".attributes"]);
        const services = this.getObjectServices(id, tree, storage);
        const channelDetails = await this.loadChannel(
            id,
            channelAttributes.type,
            channelAttributes.snapshotFormatVersion,
            this.deltaManager.minimumSequenceNumber,
            services,
            branch);

        assert(!this.channels.has(id));
        this.channels.set(id, channelDetails);
        this.channelsDeferred.get(id).resolve(channelDetails.object);
    }

    private async loadChannel(
        id: string,
        type: string,
        snapshotFormatVersion: string | undefined,
        minSequenceNumber: number,
        services: IObjectServices,
        originBranch: string): Promise<IChannelState> {

        // Pass the transformedMessages - but the object really should be storing this
        const extension = this.registry.get(type);

        // compare snapshot version to collaborative object version
        if (snapshotFormatVersion !== undefined && snapshotFormatVersion !== extension.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${type}, ` +
                    `Snapshot format version: ${snapshotFormatVersion}, ` +
                    `client format version: ${extension.snapshotFormatVersion}`);
        }

        // TODO need to fix up the SN vs. MSN stuff here. If want to push messages to object also need
        // to store the mappings from channel ID to doc ID.
        const value = await extension.load(
            this,
            id,
            minSequenceNumber,
            services,
            originBranch);

        return {
            baseSha: services.baseSha,
            connection: services.deltaConnection,
            object: value,
            storage: services.objectStorage,
        };
    }

    private getObjectServices(
        id: string,
        tree: ISnapshotTree,
        storage: IDocumentStorageService): IObjectServices {

        const deltaConnection = new ChannelDeltaConnection(
            id,
            this.componentContext.connectionState,
            (message) => {
                const envelope: IEnvelope = { address: id, contents: message };
                return this.submit(MessageType.Operation, envelope);
            });
        const objectStorage = new ChannelStorageService(tree, storage);

        return {
            baseSha: tree ? tree.sha : null,
            deltaConnection,
            objectStorage,
        };
    }

    // Ideally the component runtime should drive this. But the interface change just for this
    // is probably an overkill.
    private attachListener() {
        this.componentContext.on("leader", (clientId: string) => {
            this.emit("leader", clientId);
        });
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
