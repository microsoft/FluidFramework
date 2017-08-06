import { IDocumentMessage, ISequencedDocumentMessage } from "./protocol";

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

/**
 * Interface to provide access to snapshots saved for a collaborative object
 */
export interface IDocumentStorageService {
    /**
     * Reads the object with the given ID
     */
    // TODO should we just provide file system like semantics here or expose block level access
    read(path: string): Promise<string>;

    /**
     * Writes to the object with the given ID
     */
    write(objects: IObject[]): Promise<void>;
}

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
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

    // The sequence number for the object
    sequenceNumber: number;
}

export interface IDocumentDeltaConnection {
    /**
     * Subscribe to events emitted by the document
     */
    on(event: string, listener: Function): this;

    /**
     * Submit a new message to the server
     */
    submit(message: IDocumentMessage): Promise<void>;
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
     * Connection to receive delta notification
     */
    deltaConnection: IDocumentDeltaConnection;

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

    /**
     * Pending deltas that have not yet been included in a snapshot
     */
    pendingDeltas: ISequencedDocumentMessage[];

    /**
     * The sequence number represented by this version of the document
     */
    sequenceNumber: number;
}

export interface IDocumentService {
    connect(id: string): Promise<IDocument>;
}
