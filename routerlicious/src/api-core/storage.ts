import * as resources from "gitresources";
import { IAuthenticatedUser, IDocumentMessage, ISequencedDocumentMessage } from "./protocol";

export interface IDocumentAttributes {
    /**
     * Name of the branch that created the snapshot
     */
    branch: string;

    /**
     * Sequence number at which the snapshot was taken
     */
    sequenceNumber: number;

    /**
     * Minimum sequence number when the snapshot was taken
     */
    minimumSequenceNumber: number;
}

export interface IObjectAttributes {
    sequenceNumber: number;

    type: string;
}

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
 * Type of entries that can be stored in a tree
 */
export enum TreeEntry {
    Blob,
    Tree,
}

/**
 * Tree storage
 */
export interface ITree {
    entries: ITreeEntry[];
}

/**
 * A tree entry wraps a path with a type of node
 */
export interface ITreeEntry {
    // Path to the object
    path: string;

    // One of the above enum string values
    type: string;

    // The value of the entry - either a tree or a blob
    value: IBlob | ITree;
}

/**
 * Raw blob stored within the tree
 */
export interface IBlob {
    // Contents of the blob
    contents: string;

    // The encoding of the contents string (utf-8 or base64)
    encoding: string;
}

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(tenantId: string, id: string, token: string, from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
}

export interface ISnapshotTree {
    blobs: { [path: string]: string };
    trees: { [path: string]: ISnapshotTree };
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

    // The sequence number for the object
    sequenceNumber: number;
}

/**
 * Interface to provide access to snapshots saved for a collaborative object
 */
export interface IDocumentStorageService {
    /**
     * Returns the snapshot tree.
     */
    getSnapshotTree(version: resources.ICommit): Promise<ISnapshotTree>;

    /**
     * Retrives all versions of the document starting at the specified sha - or null if from the head
     */
    getVersions(sha: string, count: number): Promise<resources.ICommit[]>;

    /**
     * Reads the object with the given ID
     */
    read(path: string): Promise<string>;

    /**
     * Writes to the object with the given ID
     */
    write(root: ITree, message: string): Promise<resources.ICommit>;
}

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDocumentDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
}

// TODO inherit from EventEmitter
export interface IDocumentDeltaConnection {
    /**
     * ClientID for the connection
     */
    clientId: string;

    /**
     * DocumentId for the connection
     */
    documentId: string;

    /**
     * Whether the connection was made to a new or existing document
     */
    existing: boolean;

    /**
     * The parent branch for the document
     */
    parentBranch: string;

    /**
     * The identity of the logged-in user
     */
    user: IAuthenticatedUser;

    /**
     * Subscribe to events emitted by the document
     */
    on(event: string, listener: Function): this;

    /**
     * Submit a new message to the server
     */
    submit(message: IDocumentMessage): void;

    /**
     * Disconnects the given delta connection
     */
    disconnect();
}

export interface IDocumentService {
    /**
     * Access to storage associated with the document
     */
    connectToStorage(tenantId: string, id: string, token: string): Promise<IDocumentStorageService>;

    /**
     * Access to delta storage associated with the document
     */
    connectToDeltaStorage(tenantId: string, id: string, token: string): Promise<IDocumentDeltaStorageService>;

    /**
     * Subscribes to the document delta stream
     */
    connectToDeltaStream(tenantId: string, id: string, token: string): Promise<IDocumentDeltaConnection>;

    /**
     * Creates a branch of the document with the given ID. Returns the new ID.
     */
    branch(tenantId: string, id: string, token: string): Promise<string>;
}
