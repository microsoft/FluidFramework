import * as assert from "assert";
import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import performanceNow = require("performance-now");
import * as api from "../api-core";
import * as cell from "../cell";
import { Deferred } from "../core-utils";
import { ICell, IMap, IStream } from "../data-types";
import * as mapExtension from "../map";
import * as sharedString from "../shared-string";
import * as stream from "../stream";
import { debug } from "./debug";
import { BrowserErrorTrackingService } from "./errorTrackingService";

const rootMapId = "root";

// Registered services to use when loading a document
let defaultDocumentService: api.IDocumentService;

// The default registry for collaborative object types
export const defaultRegistry = new api.Registry<api.ICollaborativeObjectExtension>();
export const defaultDocumentOptions = Object.create(null);
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new sharedString.CollaboritiveStringExtension());
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
            minimumSequenceNumber: 0,
            sequenceNumber: 0,
        },
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
    // tslint:enable:variable-name

    private messagesSinceMSNChange = new Array<api.ISequencedDocumentMessage>();
    private clients = new Set<string>();
    private connectionState = api.ConnectionState.Disconnected;
    private lastReason: string;
    private lastContext: string;
    private pendingAttach = new Map<string, api.IAttachMessage>();
    private storageService: api.IDocumentStorageService;
    private lastMinSequenceNumber;
    private tenantId: string;
    private loaded = false;

    public get clientId(): string {
        return this._deltaManager ? this._deltaManager.clientId : "disconnected";
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
        this.tenantId = claims.tenantId;
        this._user = claims.user;

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
        return this.create(sharedString.CollaboritiveStringExtension.Type) as sharedString.SharedString;
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
        const message: api.ICollaborativeObjectSave = { type: api.SAVE, message: tag };
        this.submitMessage(api.SaveOperation, message);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not yet implemented");
    }

    public submitObjectMessage(envelope: api.IEnvelope): void {
        this.submitMessage(api.ObjectOperation, envelope);
    }

    public submitLatencyMessage(message: api.ILatencyMessage) {
        this._deltaManager.submitRoundtrip(api.RoundTrip, message);
    }

    public branch(): Promise<string> {
        return this.service.branch(this.tenantId, this.id, this.opts.token);
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
    public getUser(): api.ITenantUser {
        return this._user;
    }

    public getClients(): Set<string> {
        return new Set<string>(this.clients);
    }

    // make this private
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
        let connectResult: IConnectResult = connect
            ? this.connect(headerP)
            : { detailsP: Promise.resolve(null), handlerAttachedP: Promise.resolve() };

        // Wait for all the loading promises to finish
        return Promise
            .all([storageP, versionP, headerP, dataStructuresLoadedP, connectResult.handlerAttachedP])
            .then(async ([storageService, version, header]) => {
                this.storageService = storageService;
                this.lastMinSequenceNumber = header.attributes.minimumSequenceNumber;

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
                this.notifyConnectionState(this.connectionState, this.lastReason, this.lastContext);

                // Waiting on the root is also good
                // If it's a new document we create the root map object - otherwise we wait for it to become available
                // This I don't think I can get rid of
                if (!this.existing) {
                    this.createAttached("root", mapExtension.MapExtension.Type);
                } else {
                    await this.get("root");
                }

                debug(`Document loaded ${this.id}: ${performanceNow()} `);
            });
    }

    private connect(headerP: Promise<IHeaderDetails>): IConnectResult {
        // Create the DeltaManager and begin listening for connection events
        this._deltaManager = new api.DeltaManager(this.id, this.tenantId, this.service);

        // Open a connection - the DeltaMananger will automatically reconnect
        const detailsP = this._deltaManager.connect("Document loading", this.opts.token);
        this._deltaManager.on("connect", (details: api.IConnectionDetails) => {
            this.setConnectionState(api.ConnectionState.Connecting, "Connected to Routerlicious", details.clientId);
        });

        this._deltaManager.on("disconnect", (nack: boolean) => {
            this.setConnectionState(api.ConnectionState.Disconnected, `Disconnected - nack === ${nack}`);
        });

        this._deltaManager.on("error", (error) => {
            this.emit("error", error);
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
        const attributesP = readAndParse<api.IDocumentAttributes>(storage, tree.blobs[".attributes"]);

        const distributedObjectsP = Array<Promise<api.IDistributedObject>>();

        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const objectAttributesP = readAndParse<api.IObjectAttributes>(
                storage,
                tree.trees[path].blobs[".attributes"]);
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

    private setConnectionState(value: api.ConnectionState.Disconnected, reason: string);
    private setConnectionState(value: api.ConnectionState.Connecting, reason: string, clientId: string);
    private setConnectionState(value: api.ConnectionState.Connected, reason: string, clientId: string);
    private setConnectionState(value: api.ConnectionState, reason: string, context?: string) {
        if (this.connectionState === value) {
            // Already in the desired state - exit early
            return;
        }

        debug(`Changing from ${api.ConnectionState[this.connectionState]} to ${api.ConnectionState[value]}`, reason);
        this.connectionState = value;
        this.lastReason = reason;
        this.lastContext = context;

        if (!this.loaded) {
            // If not fully loaded return early
            return;
        }

        this.notifyConnectionState(value, reason, context);
    }

    private notifyConnectionState(value: api.ConnectionState, reason: string, context?: string) {
        // Resend all pending attach messages prior to notifying clients
        if (this.connectionState === api.ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submitMessage(api.AttachObject, message);
            }
        }

        // Notify connected client objects of the change
        for (const [, object] of this.distributedObjects) {
            if (object.connection) {
                switch (value) {
                    case api.ConnectionState.Disconnected:
                        object.connection.setConnectionState(value, reason);
                        break;
                    case api.ConnectionState.Connecting:
                        object.connection.setConnectionState(value, context);
                        break;
                    case api.ConnectionState.Connected:
                        object.connection.setConnectionState(value, context);
                        break;
                    default:
                        break;
                }
            }
        }
    }

    private snapshotCore(): api.ITree {
        const entries: api.ITreeEntry[] = [];

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
            path: ".messages",
            type: api.TreeEntry[api.TreeEntry.Blob],
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
                const objectAttributes: api.IObjectAttributes = {
                    sequenceNumber: object.connection.minimumSequenceNumber,
                    type: object.object.type,
                };
                snapshot.entries.push({
                    path: ".attributes",
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(objectAttributes),
                        encoding: "utf-8",
                    },
                });

                // And then store the tree
                entries.push({
                    path: objectId,
                    type: api.TreeEntry[api.TreeEntry.Tree],
                    value: snapshot,
                });
            }
        }

        // Save attributes for the document
        const documentAttributes: api.IDocumentAttributes = {
            branch: this.id,
            minimumSequenceNumber: this._deltaManager.minimumSequenceNumber,
            sequenceNumber: this._deltaManager.referenceSequenceNumber,
        };
        entries.push({
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

        this.reservations.get(id).resolve(object);
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

        const deltaConnection = new api.ObjectDeltaConnection(id, this, this.clientId, this.connectionState);
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
        } else if (message.type === api.AttachObject && message.clientId !== this.clientId) {
            const attachMessage = message.contents as api.IAttachMessage;

            // create storage service that wraps the attach data
            const localStorage = new api.LocalObjectStorageService(attachMessage.snapshot);
            const connection = new api.ObjectDeltaConnection(
                attachMessage.id,
                this,
                this.clientId,
                this.connectionState);

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

                objectDetails.connection.process(message, context);
                eventArgs.push(objectDetails.object);
                break;

            case api.AttachObject:
                const attachMessage = message.contents as api.IAttachMessage;

                // If a non-local operation then go and create the object - otherwise mark it as officially
                // attached.
                if (message.clientId !== this.clientId) {
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
                this.clients.add(message.contents);
                if (message.contents === this.clientId) {
                    this.setConnectionState(
                        api.ConnectionState.Connected,
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
