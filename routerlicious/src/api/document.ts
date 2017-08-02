import * as assert from "assert";
import * as uuid from "node-uuid";
import * as cell from "../cell";
import * as ink from "../ink";
import * as mapExtension from "../map";
import * as mergeTree from "../merge-tree";
import * as extensions from "./extension";
import {
    IDeltaConnection,
    IDistributedObject,
    IDistributedObjectServices,
    IDocument,
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
    constructor(private documentId: string, private storage: IDocumentStorageService, private version: string) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(this.documentId, this.version, path);
    }
}

class DeltaConnection implements IDeltaConnection {
    constructor(public objectId: string) {
    }

    public on(event: string, listener: Function): this {
        throw new Error("Method not implemented.");
    }

    public updateReferenceSequenceNumber(sequenceNumber: number): Promise<void> {
        throw new Error("Method not implemented.");
    }
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
    private distributedObjects: { [key: string]: types.ICollaborativeObject } = {};

    public get clientId(): string {
        return this.document.clientId;
    }

    /**
     * Constructs a new document from the provided details
     */
    private constructor(private document: IDocument, private registry: extensions.Registry) {
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
        return id in this.distributedObjects ? this.distributedObjects[id] : null;
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
        return this.distributedObjects[rootMapId] as types.IMap;
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
            services,
            this.document.version,
            distributedObject.header);

        this.distributedObjects[distributedObject.id] = value;
    }

    private listenForUpdates() {
        this.deltaManager = new api.DeltaManager(
            this.sequenceNumber,
            this.services.deltaStorageService,
            this.connection,
            {
                getReferenceSequenceNumber: () => {
                    return this.sequenceNumber;
                },
                op: (message) => {
                    this.processRemoteMessage(message);
                },
            });
    }

    private getObjectServices(id: string): IDistributedObjectServices {
        const connection = new DeltaConnection(id);
        const storage = new ObjectStorageService(
            this.document.documentId,
            this.document.documentStorageService,
            this.document.version);

        return {
            deltaConnection: connection,
            objectStorage: storage,
        };
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
