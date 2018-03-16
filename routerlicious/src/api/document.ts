import * as assert from "assert";
import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as uuid from "uuid/v4";
import performanceNow = require("performance-now");
import {
    AttachObject,
    DeltaConnection,
    DeltaManager,
    IAttachMessage,
    ICollaborativeObject,
    ICollaborativeObjectSave,
    IDeltaConnection,
    IDeltaManager,
    IDistributedObject,
    IDistributedObjectServices,
    IDocumentAttributes,
    IDocumentResource,
    IDocumentService,
    IEnvelope,
    IExtension,
    ILatencyMessage,
    IObjectAttributes,
    IObjectMessage,
    IObjectStorageService,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    LocalObjectStorageService,
    ObjectOperation,
    ObjectStorageService,
    Registry,
    RoundTrip,
    SAVE,
    SaveOperation,
    TreeEntry } from "../api-core";
import * as cell from "../cell";
import { Deferred, getOrDefault } from "../core-utils";
import { ICell, IMap, IStream } from "../data-types";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import * as stream from "../stream";
import { debug } from "./debug";

const rootMapId = "root";

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

/**
 * A document is a collection of collaborative types.
 */
export class Document extends EventEmitter {
    public static async Load(
        id: string,
        registry: Registry,
        service: IDocumentService,
        options: Object,
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

        debug(`Document loading ${id} - ${performanceNow()}`);

        // Connect to the document
        const encryptedProperty = "encrypted";
        const tknProperty = "token";
        const documentConnection = await service.connect(
            id,
            version,
            connect,
            options[encryptedProperty],
            options[tknProperty]).catch((err) => {
                return Promise.reject(err);
            });
        const document = new Document(documentConnection, registry, service, options);

        // Make a reservation for the root object
        document.reserveDistributedObject("root");

        // Make reservations for all distributed objects in the snapshot
        for (const object of documentConnection.distributedObjects) {
            document.reserveDistributedObject(object.id);
        }

        // Load in distributed objects stored within the document
        const objectsLoaded = documentConnection.distributedObjects.map(async (distributedObject) => {
            const services = document.getObjectServices(distributedObject.id);
            services.deltaConnection.setBaseMapping(
                distributedObject.sequenceNumber,
                documentConnection.minimumSequenceNumber);
            const value = await document.loadInternal(
                distributedObject,
                services,
                documentConnection.snapshotOriginBranch);
            document.fulfillDistributedObject(value, services);
        });
        await Promise.all(objectsLoaded);

        // Process all pending tardis messages
        await Document.flushAndPause(document, documentConnection.transformedMessages);

        // Notify collab objects of tardis completion
        const loadComplete = documentConnection.distributedObjects.map(async (distributedObject) => {
            const object = await document.get(distributedObject.id);
            return object.loadComplete();
        });
        await Promise.all(loadComplete);

        // Process all pending deltas
        await Document.flushAndPause(document, documentConnection.pendingDeltas);

        // Start the delta manager back up
        document._deltaManager.start();

        // If it's a new document we create the root map object - otherwise we wait for it to become available
        if (!documentConnection.existing) {
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

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    private distributedObjects: { [key: string]: IDistributedObjectState } = {};

    private reservations = new Map<string, Deferred<ICollaborativeObject>>();

    // tslint:disable-next-line:variable-name
    private _deltaManager: DeltaManager;

    private lastMinSequenceNumber;

    private messagesSinceMSNChange: ISequencedDocumentMessage[] = [];

    public get clientId(): string {
        return this.document.clientId;
    }

    public get id(): string {
        return this.document.documentId;
    }

    public get deltaManager(): IDeltaManager {
        return this._deltaManager;
    }

    /**
     * Flag indicating whether the document already existed at the time of load
     */
    public get existing(): boolean {
        return this.document.existing;
    }

    /**
     * Returns the parent branch for this document
     */
    public get parentBranch(): string {
        return this.document.parentBranch;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(
        private document: IDocumentResource,
        private registry: Registry,
        private service: IDocumentService,
        private opts: Object) {

        super();

        this.lastMinSequenceNumber = this.document.minimumSequenceNumber;
        if (this.document.deltaConnection !== null) {
            if (document.snapshotOriginBranch !== this.id) {
                setParentBranch(document.transformedMessages, document.snapshotOriginBranch);
            }
            const pendingMessages = document.transformedMessages.concat(document.pendingDeltas);

            this._deltaManager = new DeltaManager(
                this.document.minimumSequenceNumber,
                pendingMessages,
                this.document.deltaStorageService,
                this.document.deltaConnection,
                {
                    prepare: async (message) => {
                        return this.prepareRemoteMessage(message);
                    },
                    process: (message, context) => {
                        this.processRemoteMessage(message, context);
                    },
                });
        }
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
        this.submitMessage(AttachObject, message);

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(object.id);
        const entry = this.distributedObjects[object.id];
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
        return this.distributedObjects[rootMapId].object as IMap;
    }

    /**
     * Saves the document by performing a snapshot.
     */
    public save(tag: string = null) {
        const saveMessage: ICollaborativeObjectSave = { type: SAVE, message: tag};
        this.submitSaveMessage(saveMessage);
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not yet implemented");
    }

    public submitObjectMessage(envelope: IEnvelope): Promise<void> {
        return this.submitMessage(ObjectOperation, envelope);
    }

    public submitSaveMessage(message: ICollaborativeObjectSave): Promise<void> {
        return this.submitMessage(SaveOperation, message);
    }

    public submitLatencyMessage(message: ILatencyMessage) {
        this._deltaManager.submitRoundtrip(RoundTrip, message);
    }

    public branch(): Promise<string> {
        return this.service.branch(this.id);
    }

    /**
     * Called to snapshot the given document
     */
    public async snapshot(tagMessage: string = undefined): Promise<void> {
        await this._deltaManager.flushAndPause();
        const root = this.snapshotCore();
        this._deltaManager.start();

        const message = `Commit @${this._deltaManager.referenceSequenceNumber}${getOrDefault(tagMessage, "")}`;
        await this.document.documentStorageService.write(root, message);
    }

    /**
     * Returns the user id connected to the document.
     */
    public getUser(): any {
        return this.document.user;
    }

    private snapshotCore(): ITree {
        const entries: ITreeEntry[] = [];

        // TODO: support for branch snapshots. For now simply no-op when a branch snapshot is requested
        if (this.document.parentBranch) {
            debug(`Skipping snapshot due to being branch of ${this.document.parentBranch}`);
            return;
        }

        // Transform ops in the window relative to the MSN - the window is all ops between the min sequence number
        // and the current sequence number
        assert.equal(
            this._deltaManager.referenceSequenceNumber - this._deltaManager.minimumSequenceNumber,
            this.messagesSinceMSNChange.length);
        const transformedMessages: ISequencedDocumentMessage[] = [];
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

        // tslint:disable-next-line:forin
        for (const objectId in this.distributedObjects) {
            const object = this.distributedObjects[objectId];

            if (this.shouldSnapshot(object)) {
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
     * Helper function to determine if we should snapshot the given object. We only will snapshot non-local
     * objects whose time of attach is outside the collaboration window
     */
    private shouldSnapshot(object: IDistributedObjectState) {
        return !object.object.isLocal() &&
            object.connection.baseMappingIsSet() &&
            object.connection.baseSequenceNumber === this._deltaManager.minimumSequenceNumber;
    }

    /**
     * Transforms the given message relative to the provided sequence number
     */
    private transform(message: ISequencedDocumentMessage, sequenceNumber: number): ISequencedDocumentMessage {
        if (message.referenceSequenceNumber < this._deltaManager.minimumSequenceNumber) {
            // Allow the distributed data types to perform custom transformations
            if (message.type === ObjectOperation) {
                const envelope = message.contents as IEnvelope;
                const objectDetails = this.distributedObjects[envelope.address];
                envelope.contents = objectDetails.object.transform(
                    envelope.contents as IObjectMessage,
                    objectDetails.connection.transformDocumentSequenceNumber(sequenceNumber));
            }

            message.referenceSequenceNumber = sequenceNumber;
        }

        message.minimumSequenceNumber = sequenceNumber;
        return message;
    }

    private submitMessage(type: string, contents: any): Promise<void> {
        return this._deltaManager.submit(type, contents);
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

        this.distributedObjects[object.id] = {
            connection: services ? services.deltaConnection : null,
            object,
            storage: services ? services.objectStorage : null,
        };

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
            this.document.version,
            originBranch);

        return value;
    }

    private getObjectServices(id: string): IObjectServices {
        // Filter the storage tree to only the distributed object
        const tree = this.document.tree && id in this.document.tree.trees
            ? this.document.tree.trees[id]
            : null;

        const deltaConnection = new DeltaConnection(id, this);
        const objectStorage = new ObjectStorageService(tree, this.document.documentStorageService);

        return {
            deltaConnection,
            objectStorage,
        };
    }

    private async prepareRemoteMessage(message: ISequencedDocumentMessage): Promise<any> {
        if (message.type === ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects[envelope.address];
            return objectDetails.connection.prepare(message);
        } else if (message.type === AttachObject && message.clientId !== this.document.clientId) {
            const attachMessage = message.contents as IAttachMessage;

            // create storage service that wraps the attach data
            const localStorage = new LocalObjectStorageService(attachMessage.snapshot);
            const connection = new DeltaConnection(attachMessage.id, this);
            connection.setBaseMapping(0, message.sequenceNumber);

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
        if (message.type === ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects[envelope.address];

            objectDetails.connection.process(message, context);
            eventArgs.push(objectDetails.object);
        } else if (message.type === AttachObject) {
            const attachMessage = message.contents as IAttachMessage;

            // If a non-local operation then go and create the object - otherwise mark it as officially
            // attached.
            if (message.clientId !== this.document.clientId) {
                this.fulfillDistributedObject(context.value as ICollaborativeObject, context.services);
            } else {
                this.distributedObjects[attachMessage.id].connection.setBaseMapping(0, message.sequenceNumber);
            }
            eventArgs.push(this.distributedObjects[attachMessage.id].object);
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

            // tslint:disable-next-line:forin
            for (const objectId in this.distributedObjects) {
                const object = this.distributedObjects[objectId];
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
