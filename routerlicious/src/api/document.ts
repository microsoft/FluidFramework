import * as assert from "assert";
import { EventEmitter } from "events";
import * as resources from "gitresources";
import * as uuid from "node-uuid";
import performanceNow = require("performance-now");
import {
    AttachObject,
    DeltaConnection,
    DeltaManager,
    IAttachMessage,
    ICollaborativeObject,
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
    TreeEntry } from "../api-core";
import * as cell from "../cell";
import * as ink from "../ink";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import { debug } from "./debug";

const rootMapId = "root";

// Registered services to use when loading a document
let defaultDocumentService: IDocumentService;

// The default registry for extensions
export const defaultRegistry = new Registry();
export const defaultDocumentOptions = Object.create(null);
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new mergeTree.CollaboritiveStringExtension());
defaultRegistry.register(new ink.InkExtension());
defaultRegistry.register(new cell.CellExtension());

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

    storage: IObjectStorageService;

    connection: DeltaConnection;
}

/**
 * Polls for the root document
 */
function pollRoot(document: Document, resolve, reject) {
    if (document.get("root")) {
        resolve();
    } else {
        const pauseAmount = 100;
        debug(`Did not find root - waiting ${pauseAmount}ms`);
        setTimeout(() => pollRoot(document, resolve, reject), pauseAmount);
    }
}

/**
 * Returns a promie that resolves once the root map is available
 */
function waitForRoot(document: Document): Promise<void> {
    return new Promise<void>((resolve, reject) => pollRoot(document, resolve, reject));
}

interface IAttachedServices {
    deltaConnection: DeltaConnection;
    objectStorage: IObjectStorageService;
}

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    public static async Create(
        id: string,
        registry: Registry,
        service: IDocumentService,
        options: Object,
        version: resources.ICommit,
        connect: boolean): Promise<Document> {

        debug(`Document Creating ${id} - ${performanceNow()}`);

        // Connect to the document
        const encryptedProperty = "encrypted";
        const document = await service.connect(id, version, connect, options[encryptedProperty]);
        const returnValue = new Document(document, registry, options);

        // Load in distributed objects stored within the document
        for (const distributedObject of document.distributedObjects) {
            const services = returnValue.getObjectServices(distributedObject.id);
            services.deltaConnection.setBaseMapping(distributedObject.sequenceNumber, document.minimumSequenceNumber);
            returnValue.loadInternal(distributedObject, services);
        }

        // Apply pending deltas - first the list of transformed messages between the msn and sequence number
        // and then any pending deltas that have happened since that sequenceNumber
        returnValue.processPendingMessages(document.transformedMessages);
        assert.equal(returnValue.deltaManager.referenceSequenceNumber, document.sequenceNumber);
        returnValue.processPendingMessages(document.pendingDeltas);

        // If it's a new document we create the root map object - otherwise we wait for it to become available
        if (!document.existing) {
            returnValue.createAttached("root", mapExtension.MapExtension.Type);
        } else {
            await waitForRoot(returnValue);
        }

        debug(`Document Created ${id} - ${performanceNow()}`);

        // And return the new object
        return returnValue;
    }

    // Map from the object ID to the collaborative object for it. If the object is not yet attached its service
    // entries will be null
    private distributedObjects: { [key: string]: IDistributedObjectState } = {};

    private deltaManager: DeltaManager;

    private events = new EventEmitter();

    private lastMinSequenceNumber;

    private messagesSinceMSNChange: ISequencedDocumentMessage[] = [];

    public get clientId(): string {
        return this.document.clientId;
    }

    public get id(): string {
        return this.document.documentId;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(
        private document: IDocumentResource,
        private registry: Registry,
        private opts: Object) {

        this.lastMinSequenceNumber = this.document.minimumSequenceNumber;
        this.deltaManager = new DeltaManager(
            this.document.documentId,
            this.document.minimumSequenceNumber,
            this.document.deltaStorageService,
            this.document.deltaConnection);
        this.deltaManager.onDelta((message) => this.processRemoteMessage(message));
    }

    public get options(): Object {
        return this.opts;
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid.v4()): ICollaborativeObject {
        const extension = this.registry.getExtension(type);
        const object = extension.create(this, id);

        // Store the unattached service in the object map
        this.upsertDistributedObject(object, null);

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
    public get(id: string): ICollaborativeObject {
        return id in this.distributedObjects ? this.distributedObjects[id].object : null;
    }

    /**
     * Attaches the given object to the document which also makes it available to collaborators. The object is
     * expected to immediately submit delta messages for itself once being attached.
     *
     * @param object
     */
    public attach(object: ICollaborativeObject): IDistributedObjectServices {
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
        this.upsertDistributedObject(object, services);

        return services;
    }

    // pause + resume semantics on the op stream? To load a doc at a veresion?

    /**
     * Creates a new collaborative map
     */
    public createMap(): mapExtension.IMap {
        return this.create(mapExtension.MapExtension.Type) as mapExtension.IMap;
    }

    /**
     * Creates a new collaborative cell.
     * TODO (tanvir): replace this with type class.
     */
    public createCell(): cell.ICell {
        return this.create(cell.CellExtension.Type) as cell.ICell;
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
    public createInk(): ink.IInk {
        return this.create(ink.InkExtension.Type) as ink.IInk;
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): mapExtension.IMap {
        return this.distributedObjects[rootMapId].object as mapExtension.IMap;
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

    public submitLatencyMessage(message: ILatencyMessage) {
        this.deltaManager.submitRoundtrip(RoundTrip, message);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: (...args: any[]) => void): this {
        this.events.removeListener(event, listener);
        return this;
    }

    /**
     * Called to snapshot the given document
     */
    public async snapshot(): Promise<void> {
        const entries: ITreeEntry[] = [];

        // Transform ops in the window relative to the MSN - the window is all ops between the min sequence number
        // and the current sequence number
        assert.equal(
            this.deltaManager.referenceSequenceNumber - this.deltaManager.minimumSequenceNumber,
            this.messagesSinceMSNChange.length);
        const transformedMessages: ISequencedDocumentMessage[] = [];
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(message, this.deltaManager.minimumSequenceNumber));
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
                debug(`Snapshotting ${object.object.id}`);
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
            minimumSequenceNumber: this.deltaManager.minimumSequenceNumber,
            sequenceNumber: this.deltaManager.referenceSequenceNumber,
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

        const message = `Commit @${this.deltaManager.minimumSequenceNumber}`;
        await this.document.documentStorageService.write(root, message);
    }

    /**
     * Helper function to determine if we should snapshot the given object. We only will snapshot non-local
     * objects whose time of attach is outside the collaboration window
     */
    private shouldSnapshot(object: IDistributedObjectState) {
        // tslint:disable-next-line
        debug(`${object.object.id} ${object.object.isLocal()} - ${object.connection.baseMappingIsSet()} - ${object.connection.baseSequenceNumber} >= ${this.deltaManager.minimumSequenceNumber}`);
        return !object.object.isLocal() &&
            object.connection.baseMappingIsSet() &&
            object.connection.baseSequenceNumber === this.deltaManager.minimumSequenceNumber;
    }

    /**
     * Transforms the given message relative to the provided sequence number
     */
    private transform(message: ISequencedDocumentMessage, sequenceNumber: number): ISequencedDocumentMessage {
        if (message.referenceSequenceNumber < this.deltaManager.minimumSequenceNumber) {
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

    private processPendingMessages(messages: ISequencedDocumentMessage[]) {
        for (const message of messages) {
            this.deltaManager.handleOp(message);
        }
    }

    private submitMessage(type: string, contents: any): Promise<void> {
        return this.deltaManager.submit(type, contents);
    }

    private createAttached(id: string, type: string) {
        const object = this.create(type, id);
        object.attach();
    }

    /**
     * Loads in a distributed object and stores it in the internal Document object map
     * @param distributedObject The distributed object to load
     */
    private loadInternal(distributedObject: IDistributedObject, services: IAttachedServices) {
        const extension = this.registry.getExtension(distributedObject.type);
        const value = extension.load(
            this,
            distributedObject.id,
            distributedObject.sequenceNumber,
            services,
            this.document.version,
            distributedObject.header);

        this.upsertDistributedObject(value, services);
    }

    private getObjectServices(id: string): IAttachedServices {
        const tree = this.document.tree && id in this.document.tree.trees
            ? this.document.tree.trees[id]
            : null;

        const connection = new DeltaConnection(id, this);
        const storage = new ObjectStorageService(tree, this.document.documentStorageService);

        return {
            deltaConnection: connection,
            objectStorage: storage,
        };
    }

    private upsertDistributedObject(object: ICollaborativeObject, services: IAttachedServices) {
        if (!(object.id in this.distributedObjects)) {
            this.distributedObjects[object.id] = {
                connection: services ? services.deltaConnection : null,
                object,
                storage: services ? services.objectStorage : null,
            };
        } else {
            const entry = this.distributedObjects[object.id];
            assert.equal(entry.object, object);
            entry.connection = services.deltaConnection;
            entry.storage = services.objectStorage;
        }
    }

    private processRemoteMessage(message: ISequencedDocumentMessage) {
        const minSequenceNumberChanged = this.lastMinSequenceNumber !== message.minimumSequenceNumber;
        this.lastMinSequenceNumber = message.minimumSequenceNumber;

        // Add the message to the list of pending messages so we can transform them during a snapshot
        this.messagesSinceMSNChange.push(message);

        if (message.type === ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects[envelope.address];
            objectDetails.connection.emit(
                envelope.contents,
                message.clientId,
                message.sequenceNumber,
                message.minimumSequenceNumber,
                message.traces);
        } else if (message.type === AttachObject) {
            const attachMessage = message.contents as IAttachMessage;

            // If a non-local operation then go and create the object - otherwise mark it as officially
            // attached.
            if (message.clientId !== this.document.clientId) {
                // create storage service that wraps the attach data
                const localStorage = new LocalObjectStorageService(attachMessage.snapshot);
                const header = localStorage.readSync("header");

                const connection = new DeltaConnection(
                    attachMessage.id,
                    this);
                connection.setBaseMapping(0, message.sequenceNumber);

                const distributedObject: IDistributedObject = {
                    header,
                    id: attachMessage.id,
                    sequenceNumber: 0,
                    type: attachMessage.type,
                };

                const services = {
                    deltaConnection: connection,
                    objectStorage: localStorage,
                };

                this.loadInternal(distributedObject, services);
            } else {
                this.distributedObjects[attachMessage.id].connection.setBaseMapping(0, message.sequenceNumber);
            }
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

        this.events.emit("op", message);
    }
}

/**
 * Loads a collaborative object from the server
 */
export async function load(
    id: string,
    options: Object = defaultDocumentOptions,
    version: resources.ICommit = null,
    registry: Registry = defaultRegistry,
    service: IDocumentService = defaultDocumentService,
    connect = true): Promise<Document> {

    // Verify an extensions registry was provided
    if (!registry) {
        throw new Error("No extension registry provided");
    }

    // Verify we have services to load the document with
    if (!service) {
        throw new Error("Document service not provided to load call");
    }

    return Document.Create(id, registry, service, options, version, connect);
}
