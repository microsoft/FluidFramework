import * as assert from "assert";
import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import performanceNow = require("performance-now");
import {
    ConnectionState,
    DeltaConnection,
    DeltaManager,
    IAttachMessage,
    ICollaborativeObject,
    ICollaborativeObjectSave,
    IDeltaConnection,
    IDistributedObject,
    IDistributedObjectServices,
    IDocumentAttributes,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IEnvelope,
    IExtension,
    ILatencyMessage,
    IObjectAttributes,
    IObjectMessage,
    IObjectStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    ITreeEntry,
    LocalObjectStorageService,
    NoOp,
    ObjectStorageService,
    Registry,
    RoundTrip,
    SAVE,
    SaveOperation,
    TreeEntry,
} from "../api-core";
import * as api from "../api-core";
import * as cell from "../cell";
import { Deferred } from "../core-utils";
import { ICell, IMap, IStream } from "../data-types";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import * as stream from "../stream";
import { debug } from "./debug";
import { NullDeltaConnection } from "./nullDeltaConnection";

const rootMapId = "root";
const MaxReconnectDelay = 32000;

// Registered services to use when loading a document
let defaultDocumentService: IDocumentService;

// The default registry for extensions
export const defaultRegistry = new Registry();
export const defaultDocumentOptions = Object.create(null);
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new mergeTree.CollaboritiveStringExtension());
defaultRegistry.register(new stream.StreamExtension());
defaultRegistry.register(new cell.CellExtension());

// Register default map value types
mapExtension.registerDefaultValueType(new mapExtension.DistributedSetValueType());
mapExtension.registerDefaultValueType(new mapExtension.DistributedArrayValueType());
mapExtension.registerDefaultValueType(new mapExtension.CounterValueType());
mapExtension.registerDefaultValueType(new mergeTree.SharedIntervalCollectionValueType());

export interface IAttachedServices {
    deltaConnection: IDeltaConnection;
    objectStorage: IObjectStorageService;
}

// Internal versions of IAttachedServices
interface IObjectServices {
    deltaConnection: DeltaConnection;
    objectStorage: ObjectStorageService;
}

export function registerExtension(extension: IExtension) {
    defaultRegistry.register(extension);
}

/**
 * Registers the default services to use for interacting with collaborative documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a collaborative object.
 */
export function registerDocumentService(service: IDocumentService) {
    defaultDocumentService = service;
}

export function getDefaultDocumentService(): IDocumentService {
    return defaultDocumentService;
}

interface IDistributedObjectState {
    object: ICollaborativeObject;

    storage: ObjectStorageService;

    connection: DeltaConnection;
}

/**
 * Document details extracted from the header
 */
interface IHeaderDetails {
    // Attributes for the document
    attributes: IDocumentAttributes;

    // Distributed objects contained within the document
    distributedObjects: IDistributedObject[];

    // The transformed messages between the minimum sequence number and sequenceNumber
    transformedMessages: ISequencedDocumentMessage[];

    // Tree representing all blobs in the snapshot
    tree: ISnapshotTree;
}

function getEmptyHeader(id: string): IHeaderDetails {
    const emptyHeader: IHeaderDetails = {
        attributes: {
            branch: id,
            minimumSequenceNumber: 0,
            sequenceNumber: 0,
        },
        distributedObjects: [],
        transformedMessages: [],
        tree: null,
    };

    return emptyHeader;
}

function setParentBranch(messages: ISequencedDocumentMessage[], parentBranch?: string) {
    for (const message of messages) {
        // Append branch information when transforming for the case of messages stashed with the snapshot
        if (parentBranch) {
            message.origin = {
                id: parentBranch,
                minimumSequenceNumber: message.minimumSequenceNumber,
                sequenceNumber: message.sequenceNumber,
            };
        }
    }
}

async function readAndParse<T>(storage: IDocumentStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    return JSON.parse(decoded);
}

class NullServices implements api.IDocumentService {
    constructor(private service: api.IDocumentService, private parentBranch: string) {
    }

    public connectToStorage(tenantId: string, id: string, token: string): Promise<IDocumentStorageService> {
        return this.service.connectToStorage(tenantId, id, token);
    }

    public connectToDeltaStorage(tenantId: string, id: string, token: string): Promise<IDocumentDeltaStorageService> {
        return this.service.connectToDeltaStorage(tenantId, id, token);
    }

    public connectToDeltaStream(tenantId: string, id: string, token: string): Promise<api.IDocumentDeltaConnection> {
        return Promise.resolve(new NullDeltaConnection(id, this.parentBranch));
    }

    public branch(tenantId: string, id: string, token: string): Promise<string> {
        return this.service.branch(tenantId, id, token);
    }
}

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter {
    public static async Load(
        id: string,
        registry: Registry,
        service: IDocumentService,
        options: any,
        version: resources.ICommit,
        connect: boolean): Promise<Document> {

        // Verify an extensions registry was provided
        if (!registry) {
            return Promise.reject("No extension registry provided");
        }

        // Verify we have services to load the document with
        if (!service) {
            return Promise.reject("Document service not provided to load call");
        }

        // Connect to the document
        if (!connect && !version) {
            return Promise.reject("Must specify a version if connect is set to false");
        }

        debug(`Document loading ${id} - ${performanceNow()}`);

        const token = options.token;
        // TODO can remove default tenant once we require the token
        const tenantId = token ? (jwt.decode(token) as any).tenantId : "git";
        const storageP = service.connectToStorage(tenantId, id, token);
        const deltaStorageP = service.connectToDeltaStorage(tenantId, id, token);

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        if (version === undefined) {
            const versions = await storageP.then((storage) => storage.getVersions(id, 1));
            version = versions.length > 0 ? versions[1] : null;
        }

        // Kick off async operations to load the document state
        // ...get the header which provides access to the 'first page' of the document
        const headerP = storageP.then((storage) => this.getHeader(id, storage, version));

        // ...load in all deltas later than the sequence number specified in the header
        const pendingDeltasP = headerP.then((header) => {
            return connect
                ? deltaStorageP.then((deltaStorage) => deltaStorage.get(header ? header.attributes.sequenceNumber : 0))
                : [];
        });

        const [header, pendingDeltas, deltaStorage, storage] =
            await Promise.all([headerP, pendingDeltasP, deltaStorageP, storageP]);
        debug(`Connected to ${id} - ${performanceNow()}`);

        const documentServices = connect ? service : new NullServices(service, header.attributes.branch);
        const document = new Document(
            tenantId,
            id,
            version,
            deltaStorage,
            storage,
            pendingDeltas,
            registry,
            documentServices,
            options,
            token,
            header);
        await document.connect(token, "Document loading");

        // Make a reservation for the root object
        document.reserveDistributedObject("root");

        // Make reservations for all distributed objects in the snapshot
        for (const object of header.distributedObjects) {
            document.reserveDistributedObject(object.id);
        }

        // Load in distributed objects stored within the document
        const objectsLoaded = header.distributedObjects.map(async (distributedObject) => {
            const services = document.getObjectServices(distributedObject.id);
            services.deltaConnection.setBaseMapping(
                distributedObject.sequenceNumber,
                header.attributes.minimumSequenceNumber);
            const value = await document.loadInternal(
                distributedObject,
                services,
                header.attributes.branch);
            document.fulfillDistributedObject(value, services);
        });

        // Begin connection to the document once we have began to load all documents. This will make sure to send
        // them the onDisconnect and onConnected messages
        await Promise.all(objectsLoaded);

        // Process all pending tardis messages
        await Document.flushAndPause(document, header.transformedMessages);

        // Notify collab objects of tardis completion
        const loadComplete = header.distributedObjects.map(async (distributedObject) => {
            const object = await document.get(distributedObject.id);
            return object.loadComplete();
        });
        await Promise.all(loadComplete);

        // Process all pending deltas
        await Document.flushAndPause(document, pendingDeltas);

        // Start the delta manager back up
        document._deltaManager.start();

        // If it's a new document we create the root map object - otherwise we wait for it to become available
        if (!document.connectDetails.existing) {
            document.createAttached("root", mapExtension.MapExtension.Type);
        } else {
            await document.get("root");
        }

        debug(`Document loaded ${id} - ${performanceNow()}`);

        // And return the new object
        return document;
    }

    private static async flushAndPause(document: Document, messages: ISequencedDocumentMessage[]): Promise<void> {
        document._deltaManager.start();
        if (messages.length > 0) {
            const sequenceNumber = messages[messages.length - 1].sequenceNumber;
            await document._deltaManager.flushAndPause(sequenceNumber);
        }
    }

    private static async getHeader(
        id: string,
        storage: IDocumentStorageService,
        version: resources.ICommit): Promise<IHeaderDetails> {

        if (!version) {
            return getEmptyHeader(id);
        }

        const tree = await storage.getSnapshotTree(version);

        const messagesP = readAndParse<ISequencedDocumentMessage[]>(storage, tree.blobs[".messages"]);
        const attributesP = readAndParse<IDocumentAttributes>(storage, tree.blobs[".attributes"]);

        const distributedObjectsP = Array<Promise<IDistributedObject>>();

        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const objectAttributesP = readAndParse<IObjectAttributes>(storage, tree.trees[path].blobs[".attributes"]);
            const objectDetailsP = objectAttributesP.then((attributes) => {
                return {
                    id: path,
                    sequenceNumber: attributes.sequenceNumber,
                    type: attributes.type,
                };
            });
            distributedObjectsP.push(objectDetailsP);
        }

        const [messages, attributes, distributedObjects] = await Promise.all(
            [messagesP, attributesP, Promise.all(distributedObjectsP)]);

        return {
            attributes,
            distributedObjects,
            transformedMessages: messages,
            tree,
        };
    }

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    private distributedObjects = new Map<string, IDistributedObjectState>();

    private reservations = new Map<string, Deferred<ICollaborativeObject>>();

    // tslint:disable:variable-name
    private _deltaManager: DeltaManager;
    // tslint:enable:variable-name

    private lastMinSequenceNumber;
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();
    private clients = new Set<string>();
    private connecting: Deferred<void>;
    private connectDetails: api.IConnectionDetails;
    private connectionState = ConnectionState.Disconnected;
    private pendingAttach = new Map<string, IAttachMessage>();

    public get clientId(): string {
        return this.connectDetails ? this.connectDetails.clientId : "disconnected";
    }

    public get id(): string {
        return this._id;
    }

    public get deltaManager(): api.IDeltaManager {
        return this._deltaManager;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.connectDetails ? this.connectDetails.existing : null;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this.connectDetails ? this.connectDetails.parentBranch : null;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(
        private tenantId: string,
        // tslint:disable-next-line:variable-name
        private _id: string,
        private version: resources.ICommit,
        private deltaStorage: IDocumentDeltaStorageService,
        private storageService: IDocumentStorageService,
        pendingDeltas: ISequencedDocumentMessage[],
        private registry: Registry,
        private service: IDocumentService,
        private opts: Object,
        private token: string,
        private header: IHeaderDetails) {

        super();

        this.lastMinSequenceNumber = this.header.attributes.minimumSequenceNumber;
        if (this.header.attributes.branch !== this.id) {
            setParentBranch(header.transformedMessages, this.header.attributes.branch);
        }
        const pendingMessages = header.transformedMessages.concat(pendingDeltas);

        this._deltaManager = new DeltaManager(
            tenantId,
            this.id,
            header.attributes.minimumSequenceNumber,
            pendingMessages,
            this.deltaStorage,
            this.service,
            {
                disconnect: (message: string) => {
                    this.connect(this.token, `Disconnected ${message}`);
                },

                nack: (target: number) => {
                    // If I have to rejoin then this doesn't matter?
                    this.connect(this.token, `Connection NACK'ed - target sequence number is ${target}`);
                },

                prepare: async (message) => {
                    return this.prepareRemoteMessage(message);
                },

                process: (message, context) => {
                    this.processRemoteMessage(message, context);
                },
            });
    }

    public get options(): Object {
        return this.opts;
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid()): ICollaborativeObject {
        const extension = this.registry.getExtension(type);
        const object = extension.create(this, id);

        // Store the unattached service in the object map
        this.reserveDistributedObject(id);
        this.fulfillDistributedObject(object, null);

        return object;
    }

    /**
     * Loads the specified distributed object. Returns null if it does not exist
     *
     * This method should not be called directly. Instead access should be obtained through the root map
     * or another distributed object.
     *
     * @param id Identifier of the object to load
     */
    public async get(id: string): Promise<ICollaborativeObject> {
        return this.reservations.has(id)
            ? this.reservations.get(id).promise
            : Promise.reject("Object does not exist");
    }

    /**
     * Attaches the given object to the document which also makes it available to collaborators. The object is
     * expected to immediately submit delta messages for itself once being attached.
     *
     * @param object
     */
    public attach(object: ICollaborativeObject): IDistributedObjectServices {
        if (!this.reservations.has(object.id)) {
            throw new Error("Attached objects must be created with Document.create");
        }

        // Get the object snapshot and include it in the initial attach
        const snapshot = object.snapshot();

        const message: IAttachMessage = {
            id: object.id,
            snapshot,
            type: object.type,
        };
        this.pendingAttach.set(object.id, message);
        this.submitMessage(api.AttachObject, message);

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(object.id);
        const entry = this.distributedObjects.get(object.id);
        assert.equal(entry.object, object);
        entry.connection = services.deltaConnection;
        entry.storage = services.objectStorage;

        return services;
    }

    /**
     * Creates a new collaborative map
     */
    public createMap(): IMap {
        return this.create(mapExtension.MapExtension.Type) as IMap;
    }

    /**
     * Creates a new collaborative cell.
     * TODO (tanvir): replace this with type class.
     */
    public createCell(): ICell {
        return this.create(cell.CellExtension.Type) as ICell;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): mergeTree.SharedString {
        return this.create(mergeTree.CollaboritiveStringExtension.Type) as mergeTree.SharedString;
    }

    /**
     * Creates a new ink collaborative object
     */
    public createStream(): IStream {
        return this.create(stream.StreamExtension.Type) as IStream;
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): IMap {
        return this.distributedObjects.get(rootMapId).object as IMap;
    }

    /**
     * Saves the document by performing a snapshot.
     */
    public save(tag: string = null) {
        const message: ICollaborativeObjectSave = { type: SAVE, message: tag};
        this.submitMessage(SaveOperation, message);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not yet implemented");
    }

    public submitObjectMessage(envelope: IEnvelope): void {
        this.submitMessage(api.ObjectOperation, envelope);
    }

    public submitLatencyMessage(message: ILatencyMessage) {
        this._deltaManager.submitRoundtrip(RoundTrip, message);
    }

    public branch(): Promise<string> {
        return this.service.branch(this.tenantId, this.id, this.token);
    }

    /**
     * Called to snapshot the given document
     */
    public async snapshot(tagMessage: string = ""): Promise<void> {
        // TODO: support for branch snapshots. For now simply no-op when a branch snapshot is requested
        if (this.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        const root = this.snapshotCore();
        // tslint:disable-next-line:max-line-length
        const message = `Commit @${this._deltaManager.referenceSequenceNumber}:${this._deltaManager.minimumSequenceNumber} ${tagMessage}`;
        await this.storageService.write(root, message);
    }

    /**
     * Returns the user id connected to the document.
     */
    public getUser(): api.IAuthenticatedUser {
        return this.connectDetails ? this.connectDetails.user : null;
    }

    public getClients(): Set<string> {
        return new Set<string>(this.clients);
    }

    private async connect(token: string, reason: string): Promise<void> {
        if (this.connecting) {
            return this.connecting.promise;
        }

        const reconnectDelay = 1000;
        this.connecting = new Deferred<void>();
        this.connectCore(token, reason, reconnectDelay);

        return this.connecting.promise;
    }

    private async connectCore(token: string, reason: string, delay: number) {
        // Place back into a disconnected state while making the connection
        this.setConnectionState(ConnectionState.Disconnected, reason);

        // Begin to connect to the document
        this._deltaManager.connect(token).then(
            (details) => {
                this.setConnectionState(ConnectionState.Connecting, "Connected on Socket.IO channel", details.clientId);
                this.connectDetails = details;
                this.connecting.resolve();
                this.connecting = null;
            },
            (error) => {
                delay = Math.min(delay, MaxReconnectDelay);
                reason = `Connection failed - trying again in ${delay}ms`;
                debug(reason, error);
                setTimeout(() => this.connectCore(token, reason, delay * 2), delay);
            });
    }

    private setConnectionState(value: ConnectionState.Disconnected, reason: string);
    private setConnectionState(value: ConnectionState.Connecting, reason: string, clientId: string);
    private setConnectionState(value: ConnectionState.Connected, reason: string, clientId: string);
    private setConnectionState(value: ConnectionState, reason: string, context?: string) {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            return;
        }

        debug(`Changing from ${ConnectionState[this.connectionState]} to ${ConnectionState[value]}`, reason);
        this.connectionState = value;

        // Resend all pending attach messages prior to notifying clients
        if (this.connectionState === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submitMessage(api.AttachObject, message);
            }
        }

        // Notify connected client objects of the change
        for (const [, object] of this.distributedObjects) {
            if (object.connection) {
                switch (value) {
                    case ConnectionState.Disconnected:
                        object.connection.setConnectionState(value, reason);
                        break;
                    case ConnectionState.Connecting:
                        object.connection.setConnectionState(value, context);
                        break;
                    case ConnectionState.Connected:
                        object.connection.setConnectionState(value, context);
                        break;
                    default:
                        break;
                }
            }
        }
    }

    private snapshotCore(): ITree {
        const entries: ITreeEntry[] = [];

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
            path: ".messages",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(transformedMessages),
                encoding: "utf-8",
            },
        });

        for (const [objectId, object] of this.distributedObjects) {
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
                    path: ".attributes",
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(objectAttributes),
                        encoding: "utf-8",
                    },
                });

                // And then store the tree
                entries.push({
                    path: objectId,
                    type: TreeEntry[TreeEntry.Tree],
                    value: snapshot,
                });
            }
        }

        // Save attributes for the document
        const documentAttributes: IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
        };
        entries.push({
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
        if (message.type === api.ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects.get(envelope.address);
            envelope.contents = objectDetails.object.transform(
                envelope.contents as IObjectMessage,
                objectDetails.connection.transformDocumentSequenceNumber(
                    Math.max(message.referenceSequenceNumber, sequenceNumber)));
        } else if (message.type === api.AttachObject) {
            message.type = NoOp;
        }

        message.referenceSequenceNumber = sequenceNumber;

        return message;
    }

    private submitMessage(type: string, contents: any): void {
        // TODO better way to control access
        if (this.connectionState === ConnectionState.Connected) {
            this._deltaManager.submit(type, contents);
        }
    }

    private createAttached(id: string, type: string) {
        const object = this.create(type, id);
        object.attach();
    }

    private reserveDistributedObject(id: string) {
        // For bootstrapping simplicity we allow root to be reserved multiple times. All other objects should
        // have a single reservation call.
        assert(id === "root" || !this.reservations.has(id));

        if (!this.reservations.has(id)) {
            this.reservations.set(id, new Deferred<ICollaborativeObject>());
        }
    }

    private fulfillDistributedObject(object: ICollaborativeObject, services: IObjectServices) {
        const id = object.id;
        assert(this.reservations.has(id));

        this.distributedObjects.set(
            object.id,
            {
                connection: services ? services.deltaConnection : null,
                object,
                storage: services ? services.objectStorage : null,
            });

        this.reservations.get(id).resolve(object);
    }

    /**
     * Loads in a distributed object and stores it in the internal Document object map
     * @param distributedObject The distributed object to load
     */
    private loadInternal(
        distributedObject: IDistributedObject,
        services: IAttachedServices,
        originBranch: string): Promise<ICollaborativeObject> {

        const extension = this.registry.getExtension(distributedObject.type);
        const value = extension.load(
            this,
            distributedObject.id,
            distributedObject.sequenceNumber,
            services,
            this.version,
            originBranch);

        return value;
    }

    private getObjectServices(id: string): IObjectServices {
        // Filter the storage tree to only the distributed object
        const tree = this.header.tree && id in this.header.tree.trees
            ? this.header.tree.trees[id]
            : null;

        const deltaConnection = new DeltaConnection(id, this, this.clientId, this.connectionState);
        const objectStorage = new ObjectStorageService(tree, this.storageService);

        return {
            deltaConnection,
            objectStorage,
        };
    }

    private async prepareRemoteMessage(message: ISequencedDocumentMessage): Promise<any> {
        if (message.type === api.ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects.get(envelope.address);
            return objectDetails.connection.prepare(message);
        } else if (message.type === api.AttachObject && message.clientId !== this.clientId) {
            const attachMessage = message.contents as IAttachMessage;

            // create storage service that wraps the attach data
            const localStorage = new LocalObjectStorageService(attachMessage.snapshot);
            const connection = new DeltaConnection(attachMessage.id, this, this.clientId, this.connectionState);

            // Document sequence number references <= message.sequenceNumber should map to the object's 0 sequence
            // number. We cap to the MSN to keep a tighter window and because no references should be below it.
            connection.setBaseMapping(0, message.minimumSequenceNumber);

            const distributedObject: IDistributedObject = {
                id: attachMessage.id,
                sequenceNumber: 0,
                type: attachMessage.type,
            };

            const services = {
                deltaConnection: connection,
                objectStorage: localStorage,
            };

            const origin = message.origin ? message.origin.id : this.id;
            this.reserveDistributedObject(distributedObject.id);
            const value = await this.loadInternal(distributedObject, services, origin);

            return {
                services,
                value,
            };
        }
    }

    private processRemoteMessage(message: ISequencedDocumentMessage, context: any) {
        const minSequenceNumberChanged = this.lastMinSequenceNumber !== message.minimumSequenceNumber;
        this.lastMinSequenceNumber = message.minimumSequenceNumber;

        // Add the message to the list of pending messages so we can transform them during a snapshot
        this.messagesSinceMSNChange.push(message);

        const eventArgs: any[] = [message];
        switch (message.type) {
            case api.ObjectOperation:
                const envelope = message.contents as IEnvelope;
                const objectDetails = this.distributedObjects.get(envelope.address);

                objectDetails.connection.process(message, context);
                eventArgs.push(objectDetails.object);
                break;

            case api.AttachObject:
                const attachMessage = message.contents as IAttachMessage;

                // If a non-local operation then go and create the object - otherwise mark it as officially
                // attached.
                if (message.clientId !== this.clientId) {
                    this.fulfillDistributedObject(context.value as ICollaborativeObject, context.services);
                } else {
                    assert(this.pendingAttach.has(attachMessage.id));
                    this.pendingAttach.delete(attachMessage.id);

                    // Document sequence number references <= message.sequenceNumber should map to the object's 0
                    // sequence number. We cap to the MSN to keep a tighter window and because no references should be
                    // below it.
                    this.distributedObjects.get(attachMessage.id).connection.setBaseMapping(
                        0,
                        message.minimumSequenceNumber);
                }
                eventArgs.push(this.distributedObjects.get(attachMessage.id).object);
                break;

            case api.ClientJoin:
                this.clients.add(message.contents);
                if (message.contents === this.clientId) {
                    this.setConnectionState(
                        ConnectionState.Connected,
                        `Fully joined the document@ ${message.minimumSequenceNumber}`,
                        this.clientId);
                }

                this.emit("clientJoin", message.contents);

                break;

            case api.ClientLeave:
                this.clients.delete(message.contents);
                this.emit("clientLeave", message.contents);
                break;

            default:
                break;
        }

        if (minSequenceNumberChanged) {
            // Reset the list of messages we have received since the min sequence number changed
            let index = 0;
            for (; index < this.messagesSinceMSNChange.length; index++) {
                if (this.messagesSinceMSNChange[index].sequenceNumber > message.minimumSequenceNumber) {
                    break;
                }
            }
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);

            for (const [, object] of this.distributedObjects) {
                if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                    object.connection.updateMinSequenceNumber(message.minimumSequenceNumber);
                }
            }
        }

        this.emit("op", ...eventArgs);
    }
}

/**
 * Loads a specific version (commit) of the collaborative object
 */
export async function load(
    id: string,
    options: Object = defaultDocumentOptions,
    version: resources.ICommit = null,
    connect = true,
    registry: Registry = defaultRegistry,
    service: IDocumentService = defaultDocumentService): Promise<Document> {

    return Document.Load(id, registry, service, options, version, connect);
}
