import * as resources from "gitresources";
import { IAuthenticatedUser } from "../core-utils";
import { IDocumentMessage, ISequencedDocumentMessage } from "./protocol";

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
 * Interface to provide access to snapshots saved for a collaborative object
 */
export interface IDocumentStorageService {
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

/**
 * Interface to provide access to stored deltas for a collaborative object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(id: string, from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
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
     * Flag indicating whether connection is encrypted
     */
    encrypted: boolean;

    /**
     * Private key for decrypting deltas from the server
     */
    privateKey: string;

    /**
     * Public key for sending deltas to the server
     */
    publicKey: string;

    /**
     * Subscribe to events emitted by the document
     */
    on(event: string, listener: Function): this;

    /**
     * Submit a new message to the server
     */
    submit(message: IDocumentMessage): Promise<void>;

    /**
     * Dispatches the given event to any registered listeners.
     */
    dispatchEvent(name: string, ...args: any[]);
}

export interface IDocumentResource {
    /**
     * User connecting to the document.
     */
    user: IAuthenticatedUser;

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
    version: resources.ICommit;

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
    deltaStorageService: IDocumentDeltaStorageService;

    /**
     * Distributed objects contained within the document
     */
    distributedObjects: IDistributedObject[];

    /**
     * Messages whose values are between the msn and sequenceNumber
     */
    transformedMessages: ISequencedDocumentMessage[];

    /**
     * Pending deltas that have not yet been included in a snapshot
     */
    pendingDeltas: ISequencedDocumentMessage[];

    /**
     * Branch identifier where snapshots originated
     */
    snapshotOriginBranch: string;

    /**
     * The smallest sequence number that can be used as a reference sequence number
     */
    minimumSequenceNumber: number;

    /**
     * The sequence number represented by this version of the document
     */
    sequenceNumber: number;

    /**
     * Directory information for objects contained in the snapshot
     */
    tree: ISnapshotTree;

    /**
     * Parent branch
     */
    parentBranch: string;
}

export interface IDocumentService {
    connect(
        id: string,
        version: resources.ICommit,
        connect: boolean,
        encrypted: boolean,
        token?: string): Promise<IDocumentResource>;

    /**
     * Creates a branch of the document with the given ID. Returns the new ID.
     */
    branch(id: string): Promise<string>;
}

export interface IBlobStorageService {
    /**
     * Returns the snapshot tree.
     */
    getSnapshotTree(id: string, version: resources.ICommit): Promise<ISnapshotTree>;

    /**
     * Reads the blob content.
     */
    read(sha: string): Promise<string>;

    /**
     * Writes the content to blob storage.
     */
    write(id: string, tree: ITree, message: string): Promise<resources.ICommit>;
}
