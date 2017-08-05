import * as uuid from "node-uuid";
import * as cell from "../cell";
import * as ink from "../ink";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import { debug } from "./debug";
import { DeltaConnection } from "./deltaConnection";
import { DeltaManager } from "./deltaManager";
import * as extensions from "./extension";
import { ObjectStorageService } from "./objectStorageService";
import {
    IDocumentMessage,
    IEnvelope,
    IObjectMessage,
    ISequencedDocumentMessage,
    ObjectOperation } from "./protocol";
import {
    IDistributedObject,
    IDocument,
    IDocumentService } from "./storage";
import * as types from "./types";

const rootMapId = "root";

// Registered services to use when loading a document
let defaultDocumentService: IDocumentService;

// The default registry for extensions
export const defaultRegistry = new extensions.Registry();
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new mergeTree.CollaboritiveStringExtension());
defaultRegistry.register(new ink.InkExtension());
defaultRegistry.register(new cell.CellExtension());

export function registerExtension(extension: extensions.IExtension) {
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
    object: types.ICollaborativeObject;

    storage: ObjectStorageService;

    connection: DeltaConnection;
}

export interface IDistributedObjectServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IObjectStorageService;
}

/**
 * Interface to represent a connection to a delta notification stream
 */
export interface IDeltaConnection {
    /**
     * Subscribe to events emitted by the object
     */
    on(event: string, listener: Function): this;

    /**
     * Send new messages to the server
     */
    submit(message: IObjectMessage): this;
}

export interface IObjectStorageService {
    /**
     * Reads the object contained at the given path. Returns a base64 string representation for the object.
     */
    read(path: string): Promise<string>;
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
    objectStorage: ObjectStorageService;
}

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    public static async Create(
        id: string,
        registry: extensions.Registry,
        service: IDocumentService): Promise<Document> {

        // Connect to the document
        const document = await service.connect(id);
        const returnValue = new Document(document, registry);

        // Load in distributed objects stored within the document
        for (const distributedObject of document.distributedObjects) {
            returnValue.loadInternal(distributedObject);
        }

        // Apply pending deltas
        for (const delta of document.pendingDeltas) {
            returnValue.processRemoteMessage(delta);
        }

        // If it's a new document we create the root map object - otherwise we wait for it to become available
        if (!document.existing) {
            const map = returnValue.createMapInternal("root");
            map.attach();
        } else {
            await waitForRoot(returnValue);
        }

        // And return the new object
        return returnValue;
    }

    // Map from the object ID to the collaborative object for it
    private distributedObjects: { [key: string]: IDistributedObjectState } = {};

    private deltaManager: DeltaManager;

    private clientSequenceNumber = 0;
    private referenceSequenceNumber;
    private minimumSequenceNumber = 0;

    public get clientId(): string {
        return this.document.clientId;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(private document: IDocument, private registry: extensions.Registry) {
        this.minimumSequenceNumber = this.referenceSequenceNumber = document.sequenceNumber;
        this.deltaManager = new DeltaManager(
            this.document.documentId,
            this.document.sequenceNumber,
            this.document.deltaStorageService,
            this.document.deltaConnection);
        this.deltaManager.onDelta((message) => this.processRemoteMessage(message));
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string, id = uuid.v4()): types.ICollaborativeObject {
        const extension = this.registry.getExtension(type);
        const object = extension.create(this, id);

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
    public get(id: string): types.ICollaborativeObject {
        return id in this.distributedObjects ? this.distributedObjects[id].object : null;
    }

    /**
     * Attaches the given object to the document which also makes it available to collaborators. The object is
     * expected to immediately submit delta messages for itself once being attached.
     *
     * @param object
     */
    public attach(object: types.ICollaborativeObject): IDistributedObjectServices {
        // TODO this also probably creates the attach message in the delta stream

        // Store a reference to the object in our list of objects and then get the services
        // used to attach it to the stream
        const services = this.getObjectServices(object.id);
        this.storeDistributedObject(object, services);

        return services;
    }

    // pause + resume semantics on the op stream? To load a doc at a veresion?

    /**
     * Creates a new collaborative map
     */
    public createMap(): types.IMap {
        return this.createMapInternal();
    }

    /**
     * Creates a new collaborative cell.
     * TODO (tanvir): replace this with type class.
     */
    public createCell(): types.ICell {
        return this.create(cell.CellExtension.Type) as types.ICell;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): types.ICollaborativeObject {
        return this.create(mergeTree.CollaboritiveStringExtension.Type) as types.ICollaborativeObject;
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
    public getRoot(): types.IMap {
        return this.distributedObjects[rootMapId].object as types.IMap;
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not yet implemented");
    }

    public submitObjectMessage(envelope: IEnvelope): void {
        const documentMessage: IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: envelope,
            referenceSequenceNumber: this.referenceSequenceNumber,
            type: ObjectOperation,
        };
        this.deltaManager.submitOp(documentMessage);
    }

    public updateReferenceSequenceNumber(objectId: string, referenceSequenceNumber: number) {
        throw new Error("Not Implemented");
    }

    private createMapInternal(name?: string): types.IMap {
        return this.create(mapExtension.MapExtension.Type, name) as types.IMap;
    }

    /**
     * Loads in a distributed object and stores it in the internal Document object map
     * @param distributedObject The distributed object to load
     */
    private loadInternal(distributedObject: IDistributedObject) {
        const services = this.getObjectServices(distributedObject.id);

        const extension = this.registry.getExtension(mapExtension.MapExtension.Type);
        const value = extension.load(
            this,
            distributedObject.id,
            services,
            this.document.version,
            distributedObject.header);

        this.storeDistributedObject(value, services);
    }

    private getObjectServices(id: string): IAttachedServices {
        const connection = new DeltaConnection(id, this);
        const storage = new ObjectStorageService(this.document.documentStorageService);

        return {
            deltaConnection: connection,
            objectStorage: storage,
        };
    }

    private storeDistributedObject(object: types.ICollaborativeObject, services: IAttachedServices) {
        this.distributedObjects[object.id] = {
            connection: services.deltaConnection,
            object,
            storage: services.objectStorage,
        };
    }

    private processRemoteMessage(message: ISequencedDocumentMessage) {
        this.referenceSequenceNumber = message.referenceSequenceNumber;
        this.minimumSequenceNumber = message.minimumSequenceNumber;

        if (message.type === ObjectOperation) {
            const envelope = message.contents as IEnvelope;
            const objectDetails = this.distributedObjects[envelope.address];
            objectDetails.connection.emit(envelope.contents, message.clientId);
        }
    }
}

// TODO have some way to load a specific version of the document which won't do a fetch of pending deltas

/**
 * Loads a collaborative object from the server
 */
export async function load(
    id: string,
    registry: extensions.Registry = defaultRegistry,
    service: IDocumentService = defaultDocumentService): Promise<Document> {

    // Verify an extensions registry was provided
    if (!registry) {
        throw new Error("No extension registry provided");
    }

    // Verify we have services to load the document with
    if (!service) {
        throw new Error("Document service not provided to load call");
    }

    return Document.Create(id, registry, service);
}
