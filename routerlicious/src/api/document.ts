// tslint:disable:ban-types
import * as assert from "assert";
import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as jwt from "jsonwebtoken";
import performanceNow = require("performance-now");
import * as uuid from "uuid/v4";
import * as api from "../api-core";
import * as cell from "../cell";
import { Deferred, gitHashFile } from "../core-utils";
import { ICell, IMap, IStream } from "../data-types";
import * as mapExtension from "../map";
import * as sharedString from "../shared-string";
import * as stream from "../stream";
import { debug } from "./debug";
import { BrowserErrorTrackingService } from "./errorTrackingService";
import { analyzeTasks, getLeader } from "./taskAnalyzer";

// TODO: All these should be enforced by server as a part of document creation.
const rootMapId = "root";
const insightsMapId = "insights";
const documentTasks = ["snapshot", "spell", "intel", "translation", "augmentation"];

// Registered services to use when loading a document
let defaultDocumentService: api.IDocumentService;

// The default registry for collaborative object types
export const defaultRegistry = new api.Registry<api.ICollaborativeObjectExtension>();
export const defaultDocumentOptions = Object.create(null);
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new sharedString.CollaborativeStringExtension());
defaultRegistry.register(new stream.StreamExtension());
defaultRegistry.register(new cell.CellExtension());

// Register default map value types
mapExtension.registerDefaultValueType(new mapExtension.DistributedSetValueType());
mapExtension.registerDefaultValueType(new mapExtension.CounterValueType());
mapExtension.registerDefaultValueType(new sharedString.SharedIntervalCollectionValueType());

export interface IAttachedServices {
    deltaConnection: api.IDeltaConnection;
    objectStorage: api.IObjectStorageService;
}

// Internal versions of IAttachedServices
interface IObjectServices {
    deltaConnection: api.ObjectDeltaConnection;
    objectStorage: api.ObjectStorageService;
}

export function registerExtension(extension: api.ICollaborativeObjectExtension) {
    defaultRegistry.register(extension);
}

/**
 * Registers the default services to use for interacting with collaborative documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a collaborative object.
 */
export function registerDocumentService(service: api.IDocumentService) {
    defaultDocumentService = service;
}

export function getDefaultDocumentService(): api.IDocumentService {
    return defaultDocumentService;
}

interface IDistributedObjectState {
    object: api.ICollaborativeObject;

    storage: api.ObjectStorageService;

    connection: api.ObjectDeltaConnection;
}

interface IConnectResult {
    detailsP: Promise<api.IConnectionDetails>;
    handlerAttachedP: Promise<void>;
}

/**
 * Document details extracted from the header
 */
interface IHeaderDetails {
    // Attributes for the document
    attributes: api.IDocumentAttributes;

    blobs: api.IDataBlob[];

    // Distributed objects contained within the document
    distributedObjects: api.IDistributedObject[];

    // The transformed messages between the minimum sequence number and sequenceNumber
    transformedMessages: api.ISequencedDocumentMessage[];

    // Tree representing all blobs in the snapshot
    tree: api.ISnapshotTree;
}

function getEmptyHeader(id: string): IHeaderDetails {
    const emptyHeader: IHeaderDetails = {
        attributes: {
            branch: id,
            clients: [],
            minimumSequenceNumber: 0,
            sequenceNumber: 0,
        },
        blobs: [],
        distributedObjects: [],
        transformedMessages: [],
        tree: null,
    };

    return emptyHeader;
}

function setParentBranch(messages: api.ISequencedDocumentMessage[], parentBranch?: string) {
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

async function readAndParse<T>(storage: api.IDocumentStorageService, sha: string): Promise<T> {
    const encoded = await storage.read(sha);
    const decoded = Buffer.from(encoded, "base64").toString();
    return JSON.parse(decoded);
}

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter implements api.IDocument {
    public static async Load(
        id: string,
        registry: api.Registry<api.ICollaborativeObjectExtension>,
        service: api.IDocumentService,
        options: any,
        specifiedVersion: resources.ICommit,
        connect: boolean): Promise<Document> {

        debug(`Document loading ${id}: ${performanceNow()} `);

        // Verify an extensions registry was provided
        if (!registry) {
            return Promise.reject("No extension registry provided");
        }

        // Verify we have services to load the document with
        if (!service) {
            return Promise.reject("Document service not provided to load call");
        }

        // Connect to the document
        if (!connect && !specifiedVersion) {
            return Promise.reject("Must specify a version if connect is set to false");
        }

        // Verify a token was provided
        if (!options.token) {
            return Promise.reject("Must provide a token");
        }

        const document = new Document(id, registry, service, options);
        await document.load(specifiedVersion, connect);

        return document;
    }

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    private distributedObjects = new Map<string, IDistributedObjectState>();
    private reservations = new Map<string, Deferred<api.ICollaborativeObject>>();

    // tslint:disable:variable-name
    private _deltaManager: api.DeltaManager;
    private _existing: boolean;
    private _user: api.ITenantUser;
    private _parentBranch: string;
    private _tenantId: string;
    private _clientId = "disconnected";
    // tslint:enable:variable-name

    private messagesSinceMSNChange = new Array<api.ISequencedDocumentMessage>();
    private clients = new Map<string, api.IClient>();
    private helpRequested: Set<string> = new Set<string>();
    private connectionState = api.ConnectionState.Disconnected;
    private pendingAttach = new Map<string, api.IAttachMessage>();
    private storageService: api.IDocumentStorageService;
    private blobManager: api.IBlobManager;
    private lastMinSequenceNumber;
    private loaded = false;
    private pendingClientId: string;
    private lastPong: number;
    private clientType: string;
    private lastLeaderClientId: string;

    public get clientId(): string {
        return this._clientId;
    }

    public get tenantId(): string {
        return this._tenantId;
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
        return this._existing;
    }

    public get options(): Object {
        return this.opts;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this._parentBranch;
    }

    /**
     * Flag indicating whether all submitted ops for this document is acked.
     */
    public get hasUnackedOps(): boolean {
        for (const state of this.distributedObjects.values()) {
            if (state.object.dirty) {
                return true;
            }
        }
        return false;
    }

    /**
     * Flag indicating whether this document is fully connected.
     */
    public get isConnected(): boolean {
        return this.connectionState === api.ConnectionState.Connected;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(
        // tslint:disable-next-line:variable-name
        private _id: string,
        private registry: api.Registry<api.ICollaborativeObjectExtension>,
        private service: api.IDocumentService,
        private opts: any) {
        super();

        const token = this.opts.token;
        const claims = jwt.decode(token) as api.ITokenClaims;
        this._tenantId = claims.tenantId;
        this._user = claims.user;

        this.clientType = (this.opts.client === undefined || this.opts.client.type === api.Browser) ?
            api.Browser : api.Robot;
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid()): api.ICollaborativeObject {
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
    public async get(id: string): Promise<api.ICollaborativeObject> {
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
    public attach(object: api.ICollaborativeObject): api.IDistributedObjectServices {
        if (!this.reservations.has(object.id)) {
            throw new Error("Attached objects must be created with Document.create");
        }

        // Get the object snapshot and include it in the initial attach
        const snapshot = object.snapshot();

        const message: api.IAttachMessage = {
            id: object.id,
            snapshot,
            type: object.type,
        };
        this.pendingAttach.set(object.id, message);
        this.submitMessage(api.AttachObject, message);

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(object.id, null, this.storageService);
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
    public createString(): sharedString.SharedString {
        return this.create(sharedString.CollaborativeStringExtension.Type) as sharedString.SharedString;
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

    public createBlobMetadata(file: api.IDataBlob, sha: string): api.IDataBlob {
        file.sha = sha;
        file.url = this.storageService.getRawUrl(sha);
        this.blobManager.addBlob(file).then(() => this.submitMessage(api.BlobPrepared, file));
        return file;
    }

    public async uploadBlob(file: api.IDataBlob): Promise<api.IDataBlob> {
        const sha = gitHashFile(file.content);
        this.blobManager.createBlob(file.content).then(() => {
            this.submitMessage(api.BlobUploaded, sha);
        });
        return this.createBlobMetadata(file, sha);
    }

    public getBlobMetadata(): Promise<api.IDataBlob[]> {
        return new Promise<api.IDataBlob[]>((resolve) => {
            resolve(this.blobManager.getBlobMetadata());
        });
    }

    public async getBlob(sha: string): Promise<api.IDataBlob> {
        return this.blobManager.getBlob(sha);
    }

    /**
     * Saves the document by performing a snapshot.
     */
    public save(tag: string = null) {
        const message: api.ICollaborativeObjectSave = { type: api.SAVE, message: tag };
        this.submitMessage(api.SaveOperation, message);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        if (this._deltaManager) {
            this._deltaManager.close();
        }
        this.removeAllListeners();
    }

    public submitObjectMessage(envelope: api.IEnvelope): void {
        this.submitMessage(api.ObjectOperation, envelope);
    }

    public branch(): Promise<string> {
        return this.service.branch(this.tenantId, this.id, this.opts.token);
    }

    /**
     * Called to snapshot the given document
     */
    public snapshot(tagMessage: string = ""): Promise<void> {
        // TODO: support for branch snapshots. For now simply no-op when a branch snapshot is requested
        if (this.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.parentBranch}`);
            return;
        }

        // Grab the snapshot of the current state
        const snapshotSequenceNumber = this._deltaManager.referenceSequenceNumber;
        const root = this.snapshotCore();

        // tslint:disable-next-line:max-line-length
        const message = `Commit @${this._deltaManager.referenceSequenceNumber}:${this._deltaManager.minimumSequenceNumber} ${tagMessage}`;

        return this.storageService.getVersions(this.id, 1).then(async (lastVersion) => {
            // Pull the sequence number stored with the previous version
            let sequenceNumber = 0;
            if (lastVersion.length > 0) {
                const attributesAsString = await this.storageService.getContent(lastVersion[0], ".attributes");
                const decoded = Buffer.from(attributesAsString, "base64").toString();
                const attributes = JSON.parse(decoded) as api.IDocumentAttributes;
                sequenceNumber = attributes.sequenceNumber;
            }

            // Retrieve all deltas from sequenceNumber to snapshotSequenceNumber. Range is exclusive so we increment
            // the snapshotSequenceNumber by 1 to include it.
            const deltas = await this._deltaManager.getDeltas(sequenceNumber, snapshotSequenceNumber + 1);
            const parents = lastVersion.length > 0 ? [lastVersion[0].sha] : [];
            root.entries.push({
                mode: api.FileMode.File,
                path: "deltas",
                type: api.TreeEntry[api.TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(deltas),
                    encoding: "utf-8",
                },
            });

            await this.storageService.write(root, parents, message);
        });
    }

    /**
     * Returns the user id connected to the document.
     */
    public getUser(): api.ITenantUser {
        return this._user;
    }

    public getClients(): Map<string, api.IClient> {
        return new Map<string, api.IClient>(this.clients);
    }

    private async load(specifiedVersion: resources.ICommit, connect: boolean): Promise<void> {
        const storageP = this.service.connectToStorage(this.tenantId, this.id, this.opts.token);

        // If a version is specified we will load it directly - otherwise will query historian for the latest
        // version and then load it
        const versionP = specifiedVersion
            ? Promise.resolve(specifiedVersion)
            : storageP.then(async (storage) => {
                const versions = await storage.getVersions(this.id, 1);
                return versions.length > 0 ? versions[1] : null;
            });

        // Kick off async operations to load the document state
        // ... get the header which provides access to the 'first page' of the document
        const headerP = Promise.all([storageP, versionP])
            .then(([storage, version]) => {
                return this.getHeader(this.id, storage, version);
            });

        // ... load the distributed data structures from the snapshot
        const dataStructuresLoadedP = Promise.all([storageP, headerP]).then(async ([storage, header]) => {
            await this.loadSnapshot(storage, header);
        });

        // ... begin the connection process to the delta stream
        const connectResult: IConnectResult = connect
            ? this.connect(headerP)
            : { detailsP: Promise.resolve(null), handlerAttachedP: Promise.resolve() };

        // Wait for all the loading promises to finish
        return Promise
            .all([storageP, versionP, headerP, dataStructuresLoadedP, connectResult.handlerAttachedP])
            .then(async ([storageService, version, header]) => {
                this.storageService = storageService;
                this.lastMinSequenceNumber = header.attributes.minimumSequenceNumber;
                this.clients = new Map(header.attributes.clients);
                this.blobManager = new api.BlobManager(this.storageService);

                if (header.blobs.length > 0) {
                    this.blobManager.loadBlobMetadata(header.blobs);
                }
                // Start delta processing once all objects are loaded
                const readyP = Array.from(this.distributedObjects.values()).map((value) => value.object.ready());
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
                    this._parentBranch = header.attributes.branch !== this.id ? header.attributes.branch : null;
                } else {
                    const details = await connectResult.detailsP;
                    this._existing = details.existing;
                    this._parentBranch = details.parentBranch;
                }

                // Internal context is fully loaded at this point
                this.loaded = true;

                // Now that we are loaded notify all distributed data types of connection change
                this.notifyConnectionState(this.connectionState);

                // Waiting on the root is also good
                // If it's a new document we create the root map object - otherwise we wait for it to become available
                // This I don't think I can get rid of
                if (!this.existing) {
                    this.createAttached(rootMapId, mapExtension.MapExtension.Type);
                    this.createInsightsMap();
                } else {
                    await this.get(rootMapId);
                }
                debug(`Document loaded ${this.id}: ${performanceNow()} `);
            });
    }

    private connect(headerP: Promise<IHeaderDetails>): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        this._deltaManager = new api.DeltaManager(
            this.id,
            this.tenantId,
            this.opts.token,
            this.service,
            this.opts.client);

        // Open a connection - the DeltaMananger will automatically reconnect
        const detailsP = this._deltaManager.connect("Document loading");
        this._deltaManager.on("connect", (details: api.IConnectionDetails) => {
            this.setConnectionState(api.ConnectionState.Connecting, "Connected to Routerlicious", details.clientId);
        });

        this._deltaManager.on("disconnect", (nack: boolean) => {
            this.setConnectionState(api.ConnectionState.Disconnected, `Disconnected - nack === ${nack}`);
            this.emit("disconnect");
        });

        this._deltaManager.on("error", (error) => {
            this.emit("error", error);
        });

        this._deltaManager.on("pong", (latency) => {
            this.emit("pong", latency);
            this.lastPong = latency;
        });

        this._deltaManager.on("processTime", (time) => {
            this.emit("processTime", time);
        });

        // Begin fetching any pending deltas once we know the base sequence #. Can this fail?
        // It seems like something, like reconnection, that we would want to retry but otherwise allow
        // the document to load
        const handlerAttachedP = headerP.then((header) => {
            this._deltaManager.attachOpHandler(
                header.attributes.sequenceNumber,
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

    /**
     * Loads in all the distributed objects contained in the header
     */
    private async loadSnapshot(storage: api.IDocumentStorageService, header: IHeaderDetails): Promise<void> {
        // Update message information based on branch details
        if (header.attributes.branch !== this.id) {
            setParentBranch(header.transformedMessages, header.attributes.branch);
        }

        // Make a reservation for the root object as well as all distributed objects in the snapshot
        const transformedMap = new Map<string, api.ISequencedDocumentMessage[]>([["root", []]]);
        this.reserveDistributedObject("root");
        for (const object of header.distributedObjects) {
            this.reserveDistributedObject(object.id);
            transformedMap.set(object.id, []);
        }

        // Filter messages per distributed data type
        for (const transformedMessage of header.transformedMessages) {
            if (transformedMessage.type === api.ObjectOperation) {
                const envelope = transformedMessage.contents as api.IEnvelope;
                transformedMap.get(envelope.address).push(transformedMessage);
            }
        }

        const objectsLoaded = header.distributedObjects.map(async (distributedObject) => {
            // Filter the storage tree to only the distributed object
            const tree = header.tree && distributedObject.id in header.tree.trees
                ? header.tree.trees[distributedObject.id]
                : null;
            const services = this.getObjectServices(distributedObject.id, tree, storage);

            // Start the base mapping at the MSN
            services.deltaConnection.setBaseMapping(
                distributedObject.sequenceNumber,
                header.attributes.minimumSequenceNumber);

            // Run the transformed messages through the delta connection in order to update their offsets
            // Then pass these to the loadInternal call. Moving forward we will want to update the snapshot
            // to include the range maps. And then make the objects responsible for storing any messages they
            // need to transform.
            const transformedMessages = transformedMap.get(distributedObject.id);
            const transformedObjectMessages = transformedMessages.map((message) => {
                return services.deltaConnection.translateToObjectMessage(message, true);
            });

            // Pass the transformedMessages - but the object really should be storing this
            const value = await this.loadInternal(
                distributedObject,
                transformedObjectMessages,
                services,
                services.deltaConnection.sequenceNumber,
                header.attributes.branch);

            this.fulfillDistributedObject(value, services);
        });

        // Begin connection to the document once we have began to load all documents. This will make sure to send
        // them the onDisconnect and onConnected messages
        await Promise.all(objectsLoaded);
        debug(`objectsLoaded ${this.id}: ${performanceNow()} `);
    }

    private async getHeader(
        id: string,
        storage: api.IDocumentStorageService,
        version: resources.ICommit): Promise<IHeaderDetails> {

        if (!version) {
            return getEmptyHeader(id);
        }

        const tree = await storage.getSnapshotTree(version);

        const messagesP = readAndParse<api.ISequencedDocumentMessage[]>(storage, tree.blobs[".messages"]);
        const blobsP = readAndParse<api.IDataBlob[]>(storage, tree.blobs[".blobs"]);
        const attributesP = readAndParse<api.IDocumentAttributes>(storage, tree.blobs[".attributes"]);

        const distributedObjectsP = Array<Promise<api.IDistributedObject>>();

        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const objectAttributesP = readAndParse<api.IObjectAttributes>(
                storage,
                tree.trees[path].blobs[".attributes"]);
            const objectDetailsP = objectAttributesP.then((attrs) => {
                return {
                    id: path,
                    sequenceNumber: attrs.sequenceNumber,
                    type: attrs.type,
                };
            });
            distributedObjectsP.push(objectDetailsP);
        }

        const [messages, blobs, attributes, distributedObjects] = await Promise.all(
            [messagesP, blobsP, attributesP, Promise.all(distributedObjectsP)]);

        return {
            attributes,
            blobs,
            distributedObjects,
            transformedMessages: messages,
            tree,
        };
    }

    private setConnectionState(value: api.ConnectionState.Disconnected, reason: string);
    private setConnectionState(value: api.ConnectionState.Connecting | api.ConnectionState.Connected,
                               reason: string, clientId: string);
    private setConnectionState(value: api.ConnectionState, reason: string, context?: string) {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            return;
        }

        debug(`Changing from ${api.ConnectionState[this.connectionState]} to ${api.ConnectionState[value]}`, reason);
        this.connectionState = value;

        // Stash the clientID to detect when transitioning from connecting (socket.io channel open) to connected
        // (have received the join message for the client ID)
        if (value === api.ConnectionState.Connecting) {
            this.pendingClientId = context;
        } else if (value === api.ConnectionState.Connected) {
            this._clientId = context;
        }

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.notifyConnectionState(value);

        if (this.connectionState === api.ConnectionState.Connected) {
            this.emit("connected");
        }
    }

    private notifyConnectionState(value: api.ConnectionState) {
        // Resend all pending attach messages prior to notifying clients
        if (this.connectionState === api.ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submitMessage(api.AttachObject, message);
            }
        }

        // Notify connected client objects of the change
        for (const [, object] of this.distributedObjects) {
            if (object.connection) {
                object.connection.setConnectionState(value);
            }
        }
    }

    private snapshotCore(): api.ITree {
        const entries: api.ITreeEntry[] = [];

        // Craft the .messages file for the document
        // Transform ops in the window relative to the MSN - the window is all ops between the min sequence number
        // and the current sequence number
        assert.equal(
            this._deltaManager.referenceSequenceNumber - this._deltaManager.minimumSequenceNumber,
            this.messagesSinceMSNChange.length);
        const transformedMessages: api.ISequencedDocumentMessage[] = [];
        debug(`Transforming up to ${this._deltaManager.minimumSequenceNumber}`);
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(message, this._deltaManager.minimumSequenceNumber));
        }
        entries.push({
            mode: api.FileMode.File,
            path: ".messages",
            type: api.TreeEntry[api.TreeEntry.Blob],
            value: {
                contents: JSON.stringify(transformedMessages),
                encoding: "utf-8",
            },
        });

        const blobMetaData = this.blobManager.getBlobMetadata();
        entries.push({
            mode: api.FileMode.File,
            path: ".blobs",
            type: api.TreeEntry[api.TreeEntry.Blob],
            value: {
                contents: JSON.stringify(blobMetaData),
                encoding: "utf-8",
            },
        });

        // Craft the .attributes file for each distributed object
        for (const [objectId, object] of this.distributedObjects) {
            // If the object isn't local - and we have received the sequenced op creating the object (i.e. it has a
            // base mapping) - then we go ahead and snapshot
            if (!object.object.isLocal() && object.connection.baseMappingIsSet()) {
                const snapshot = object.object.snapshot();

                // Add in the object attributes to the returned tree
                const objectAttributes: api.IObjectAttributes = {
                    sequenceNumber: object.connection.minimumSequenceNumber,
                    type: object.object.type,
                };
                snapshot.entries.push({
                    mode: api.FileMode.File,
                    path: ".attributes",
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(objectAttributes),
                        encoding: "utf-8",
                    },
                });

                // And then store the tree
                entries.push({
                    mode: api.FileMode.Directory,
                    path: objectId,
                    type: api.TreeEntry[api.TreeEntry.Tree],
                    value: snapshot,
                });
            }
        }

        // Save attributes for the document
        const documentAttributes: api.IDocumentAttributes = {
            branch: this.id,
            clients: [...this.clients],
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
        };
        entries.push({
            mode: api.FileMode.File,
            path: ".attributes",
            type: api.TreeEntry[api.TreeEntry.Blob],
            value: {
                contents: JSON.stringify(documentAttributes),
                encoding: "utf-8",
            },
        });

        // Output the tree
        const root: api.ITree = {
            entries,
        };

        return root;
    }

    /**
     * Transforms the given message relative to the provided sequence number
     */
    private transform(message: api.ISequencedDocumentMessage, sequenceNumber: number): api.ISequencedDocumentMessage {
        // Allow the distributed data types to perform custom transformations
        if (message.type === api.ObjectOperation) {
            const envelope = message.contents as api.IEnvelope;
            const objectDetails = this.distributedObjects.get(envelope.address);
            envelope.contents = objectDetails.object.transform(
                envelope.contents as api.IObjectMessage,
                objectDetails.connection.transformDocumentSequenceNumber(
                    Math.max(message.referenceSequenceNumber, sequenceNumber)));
        } else if (message.type === api.AttachObject) {
            message.type = api.NoOp;
        }

        message.referenceSequenceNumber = sequenceNumber;

        return message;
    }

    private submitMessage(type: string, contents: any): void {
        // TODO better way to control access
        if (this.connectionState === api.ConnectionState.Connected) {
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
            this.reservations.set(id, new Deferred<api.ICollaborativeObject>());
        }
    }

    private fulfillDistributedObject(object: api.ICollaborativeObject, services: IObjectServices) {
        const id = object.id;
        assert(this.reservations.has(id));

        this.distributedObjects.set(
            object.id,
            {
                connection: services ? services.deltaConnection : null,
                object,
                storage: services ? services.objectStorage : null,
            });
        this.attachOpAckListener(object);
        this.reservations.get(id).resolve(object);
    }

    private attachOpAckListener(object: api.ICollaborativeObject) {
        object.on("processed", () => {
            if (!this.hasUnackedOps) {
                this.emit("processed");
            }
        });
    }

    /**
     * Loads in a distributed object and stores it in the internal Document object map
     * @param distributedObject The distributed object to load
     */
    private loadInternal(
        distributedObject: api.IDistributedObject,
        transformedMessages: api.ISequencedObjectMessage[],
        services: IAttachedServices,
        sequenceNumber: number,
        originBranch: string): Promise<api.ICollaborativeObject> {

        const extension = this.registry.getExtension(distributedObject.type);
        const value = extension.load(
            this,
            distributedObject.id,
            sequenceNumber,
            distributedObject.sequenceNumber,
            transformedMessages,
            services,
            originBranch);

        return value;
    }

    private getObjectServices(
        id: string,
        tree: api.ISnapshotTree,
        storage: api.IDocumentStorageService): IObjectServices {

        const deltaConnection = new api.ObjectDeltaConnection(id, this, this.connectionState);
        const objectStorage = new api.ObjectStorageService(tree, storage);

        return {
            deltaConnection,
            objectStorage,
        };
    }

    private async prepareRemoteMessage(message: api.ISequencedDocumentMessage): Promise<any> {
        if (message.type === api.ObjectOperation) {
            const envelope = message.contents as api.IEnvelope;
            const objectDetails = this.distributedObjects.get(envelope.address);
            return objectDetails.connection.prepare(message);
        } else if (message.type === api.AttachObject && message.clientId !== this._clientId) {
            const attachMessage = message.contents as api.IAttachMessage;

            // create storage service that wraps the attach data
            const localStorage = new api.LocalObjectStorageService(attachMessage.snapshot);
            const connection = new api.ObjectDeltaConnection(attachMessage.id, this, this.connectionState);

            // Document sequence number references <= message.sequenceNumber should map to the object's 0 sequence
            // number. We cap to the MSN to keep a tighter window and because no references should be below it.
            connection.setBaseMapping(0, message.minimumSequenceNumber);

            const distributedObject: api.IDistributedObject = {
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
            const value = await this.loadInternal(distributedObject, [], services, 0, origin);

            return {
                services,
                value,
            };
        }
    }

    private processRemoteMessage(message: api.ISequencedDocumentMessage, context: any) {
        const minSequenceNumberChanged = this.lastMinSequenceNumber !== message.minimumSequenceNumber;
        this.lastMinSequenceNumber = message.minimumSequenceNumber;

        // Add the message to the list of pending messages so we can transform them during a snapshot
        this.messagesSinceMSNChange.push(message);

        const eventArgs: any[] = [message];
        switch (message.type) {
            case api.ObjectOperation:
                const envelope = message.contents as api.IEnvelope;
                const objectDetails = this.distributedObjects.get(envelope.address);

                this.submitLatencyMessage(message);
                objectDetails.connection.process(message, context);
                eventArgs.push(objectDetails.object);
                break;

            case api.AttachObject:
                const attachMessage = message.contents as api.IAttachMessage;

                // If a non-local operation then go and create the object - otherwise mark it as officially
                // attached.
                if (message.clientId !== this._clientId) {
                    this.fulfillDistributedObject(context.value as api.ICollaborativeObject, context.services);
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
                this.clients.set(message.contents.clientId, message.contents.detail);
                // This is the only one that requires the pending client ID
                if (message.contents.clientId === this.pendingClientId) {
                    this.setConnectionState(
                        api.ConnectionState.Connected,
                        `Fully joined the document@ ${message.minimumSequenceNumber}`,
                        this.pendingClientId);
                }
                this.emit("clientJoin", message.contents);
                this.runTaskAnalyzer();
                break;

            case api.ClientLeave:
                const leftClientId = message.contents;
                this.clients.delete(leftClientId);
                this.emit("clientLeave", leftClientId);
                // Switch to read only mode if a client receives it's own leave message.
                if (this.clientId === leftClientId) {
                    this._deltaManager.enableReadonlyMode();
                } else {
                    this.runTaskAnalyzer();
                }
                break;

            // Message contains full metadata (no content)
            case api.BlobPrepared:
                this.blobManager.addBlob(message.contents);
                this.emit(api.BlobPrepared, message.contents);
                break;

            case api.BlobUploaded:
                // indicates that blob has been uploaded, just a flag... no blob buffer
                // message.contents is just the hash
                this.blobManager.createBlob(message.contents);
                this.emit(api.BlobUploaded, message.contents);
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

    /**
     * Submits a trace message to remote server.
     */
    private submitLatencyMessage(message: api.ISequencedDocumentMessage) {
        // Submits a roundtrip message only if the message was originally generated by this client.
        if (this.clientId === message.clientId) {
            // Add final ack trace.
            message.traces.push({
                action: "end",
                service: this.clientType,
                timestamp: performanceNow(),
            });
            // Add a ping trace if available.
            if (this.lastPong) {
                message.traces.push({
                    action: undefined,
                    service: `${this.clientType}-ping`,
                    timestamp: this.lastPong,
                });
                this.lastPong = undefined;
            }
            const latencyMessage: api.ILatencyMessage = {
                traces: message.traces,
            };
            this._deltaManager.submitRoundtrip(api.RoundTrip, latencyMessage);
        }
    }

    private createInsightsMap() {
        const rootMap = this.getRoot();
        rootMap.set(insightsMapId, this.createMap());
    }

    /**
     * On a client joining/departure, decide whether this client is the new leader.
     * If so, calculate if there are any unhandled tasks for browsers and remote agents.
     * Emit local help message for this browser and submits a remote help message for agents.
     *
     * To prevent recurrent op sending, we keep track of already requested tasks and only send
     * help for each task once. We also keep track of last leader client as the reconnection
     * should start from a clean slate.
     *
     * With this restriction of sending only one help message, some taks may never get picked (e.g., paparazzi leaves
     * and we are still having the same leader)
     *
     * TODO: Need to fix this logic once services are hardened better.
     */
    private runTaskAnalyzer() {
            const currentLeader = getLeader(this.getClients());
            const isLeader = currentLeader && currentLeader.clientId === this.clientId;
            if (isLeader) {
                console.log(`Client ${this.clientId} is the current leader!`);

                // On a reconnection, start with a clean slate.
                if (this.lastLeaderClientId !== this.clientId) {
                    this.helpRequested.clear();
                }
                this.lastLeaderClientId = this.clientId;

                // Analyze the current state and ask for local and remote help seperately.
                const helpTasks = analyzeTasks(this.clientId, this.getClients(), documentTasks, this.helpRequested);
                if (helpTasks && helpTasks.browser.length > 0) {
                    const localHelpMessage: api.IHelpMessage = {
                        tasks: helpTasks.browser,
                    };
                    console.log(`Local help needed for ${helpTasks.browser}`);
                    this.emit("localHelp", localHelpMessage);
                }
                if (helpTasks && helpTasks.robot.length > 0) {
                    const remoteHelpMessage: api.IHelpMessage = {
                        tasks: helpTasks.robot,
                    };
                    console.log(`Remote help needed for ${helpTasks.robot}`);
                    this.submitMessage(api.RemoteHelp, remoteHelpMessage);
                }
            }
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
    registry: api.Registry<api.ICollaborativeObjectExtension> = defaultRegistry,
    service: api.IDocumentService = defaultDocumentService): Promise<Document> {
    if (service.errorTrackingEnabled()) {
        const deferred = new Deferred<Document>();
        const errorTracker = new BrowserErrorTrackingService();
        errorTracker.track(() => {
            const documentP = Document.Load(id, registry, service, options, version, connect);
            deferred.resolve(documentP);
        });
        return deferred.promise;
    } else {
        return Document.Load(id, registry, service, options, version, connect);
    }
}
