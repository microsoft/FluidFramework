import { IMessage, ISequencedMessage } from "./protocol";

/**
 * The worker service connects to work manager (TMZ) and registers itself to receive work.
 */
export interface IWorkerService {
    /**
     * Connects to tmz and subscribes to start working.
     */
    connect(type: string): Promise<any>;
}

/**
 * Interface representing a storage object
 */
export interface IObject {
    // The path to the object
    path: string;

    // The data to store for the object
    data: any;
}

export interface IDistributedObjectServices {
    deltaConnection: IDeltaConnection;

    objectStorage: IObjectStorageService;
}

/**
 * Interface to provide access to snapshots saved for a collaborative object
 */
export interface IDocumentStorageService {
    /**
     * Reads the object with the given ID
     */
    // TODO should we just provide file system like semantics here or expose block level access
    read(id: string, version: string, path: string): Promise<any>;

    /**
     * Writes to the object with the given ID
     */
    write(id: string, objects: IObject[]): Promise<void>;
}

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(id: string, from?: number, to?: number): Promise<ISequencedMessage[]>;
}

export interface IObjectStorageService {
    /**
     * Reads the object contained at the given path. Returns a base64 string representation for the object.
     */
    read(path: string): Promise<string>;
}

/**
 * Interface to represent a connection to a delta notification stream
 */
export interface IDeltaConnection {
    objectId: string;

    /**
     * Subscribe to events emitted by the object
     */
    on(event: string, listener: Function): this;

    /**
     * Updates the reference sequence number on the given connection
     */
    updateReferenceSequenceNumber(sequenceNumber: number): Promise<void>;
}

/**
 * A distributed object is enough information to fully load a distributed object. The object may then require
 * a server call to load in more state.
 */
export interface IDistributedObject {
    // The ID for the distributed object
    id: string;

    // The type of the distributed object
    type: string;

    // Base 64 encoded snapshot information
    header: string;
}

export interface IDocument {
    /**
     * Client identifier for this session
     */
    clientId: string;

    /**
     * Document identifier
     */
    documentId: string;

    /**
     * Whether or not the document existed prior to connection
     */
    existing: boolean;

    /**
     * The latest snapshot version of the document at the time of connect. Or null if no snapshots have been taken.
     */
    version: string;

    /**
     * Access to storage associated with the document
     */
    documentStorageService: IDocumentStorageService;

    /**
     * Access to delta storage associated with the document
     */
    deltaStorageService: IDeltaStorageService;

    /**
     * Distributed objects contained within the document
     */
    distributedObjects: IDistributedObject[];

    // TODO pending deltas go here

    /**
     * Submit new messages to the server
     */
    submitOp(message: IMessage): Promise<void>;
}

export interface IDocumentService {
    connect(id: string): Promise<IDocument>;
}
