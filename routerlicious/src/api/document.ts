import * as assert from "assert";
import { EventEmitter } from "events";
import * as uuid from "node-uuid";
import * as cell from "../cell";
import * as ink from "../ink";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import { DeltaManager } from "./deltaManager";
import * as extensions from "./extension";
import { IBase, IMessage, OperationType } from "./protocol";
import {
    IDeltaConnection,
    IDistributedObject,
    IDistributedObjectServices,
    IDocument,
    IDocumentDeltaConnection,
    IDocumentService,
    IDocumentStorageService,
    IObjectStorageService } from "./storage";
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

class ObjectStorageService implements IObjectStorageService {
    constructor(private storage: IDocumentStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(path);
    }
}

class DeltaConnection implements IDeltaConnection {
    protected events = new EventEmitter();

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client has only received messages
    private readonly = true;

    // The last sequence number we received from the server
    private referenceSequenceNumber;

    constructor(public objectId: string, private connection: IDocumentDeltaConnection) {
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(message: IBase) {
        this.referenceSequenceNumber = message.object.sequenceNumber;
        this.events.emit("op", message);

        // We will queue a message to update our reference sequence number upon receiving a server operation. This
        // allows the server to know our true reference sequence number and be able to correctly update the minimum
        // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update)
        // to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the update, etc...).
        if (message.type === OperationType) {
            this.updateSequenceNumber();
        }
    }

    /**
     * Send new messages to the server
     */
    public submitOp(message: IMessage): Promise<void> {
        this.readonly = false;
        this.stopSequenceNumberUpdate();

        // TODO this probably needs to be appended with other stuff

        return this.connection.submitOp(message);
    }

    /**
     * Acks the server to update the reference sequence number
     */
    private updateSequenceNumber() {
        // Exit early for readonly clients. They don't take part in the minimum sequence number calculation.
        if (this.readonly) {
            return;
        }

        // If an update has already been requeested then mark this fact. We will wait until no updates have
        // been requested before sending the updated sequence number.
        if (this.updateSequenceNumberTimer) {
            this.updateHasBeenRequested = true;
            return;
        }

        // Clear an update in 100 ms
        this.updateSequenceNumberTimer = setTimeout(() => {
            this.updateSequenceNumberTimer = undefined;

            // If a second update wasn't requested then send an update message. Otherwise defer this until we
            // stop processing new messages.
            if (!this.updateHasBeenRequested) {
                // TODO this probably needs the object its updating the ref seq # for
                this.connection.updateReferenceSequenceNumber(this.objectId, this.referenceSequenceNumber);
            } else {
                this.updateHasBeenRequested = false;
                this.updateSequenceNumber();
            }
        }, 100);
    }

    private stopSequenceNumberUpdate() {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }

        this.updateHasBeenRequested = false;
        this.updateSequenceNumberTimer = undefined;
    }
}

interface IDistributedObjectState {
    object: types.ICollaborativeObject;

    storage: ObjectStorageService;

    connection: DeltaConnection;
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

        assert(returnValue.getRoot(), "Root map must always exist");

        // TODO process all pending delta operations on those objects
        // This will need a delta map

        // And return the new object
        return returnValue;
    }

    // Map from the object ID to the collaborative object for it
    private distributedObjects: { [key: string]: IDistributedObjectState } = {};

    private deltaManager: DeltaManager;

    public get clientId(): string {
        return this.document.clientId;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(private document: IDocument, private registry: extensions.Registry) {
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
    public create(type: string): types.ICollaborativeObject {
        const extension = this.registry.getExtension(type);
        const object = extension.create(this, uuid.v4());

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
        return this.getObjectServices(object.id);
    }

    // pause + resume semantics on the op stream? To load a doc at a veresion?

    /**
     * Creates a new collaborative map
     */
    public createMap(): types.IMap {
        return this.create(mapExtension.MapExtension.Type) as types.IMap;
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

        this.distributedObjects[distributedObject.id] = {
            connection: services.deltaConnection,
            object: value,
            storage: services.objectStorage,
        };
    }

    private getObjectServices(id: string): { deltaConnection: DeltaConnection, objectStorage: ObjectStorageService } {
        const connection = new DeltaConnection(id, this.document.deltaConnection);
        const storage = new ObjectStorageService(this.document.documentStorageService);

        return {
            deltaConnection: connection,
            objectStorage: storage,
        };
    }

    private processRemoteMessage(message: IBase) {
        const objectDetails = this.distributedObjects[message.objectId];
        objectDetails.connection.emit(message);
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
