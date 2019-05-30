import { EventEmitter } from "events";
import { IClient } from "./clients";
import { IResolvedUrl } from "./loader";
import {
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "./protocol";
import { ISummaryCommit, ISummaryPackfileHandle } from "./summary";
import { ITokenProvider } from "./tokens";

export interface IDocumentAttributes {
    /**
     * Name of the branch that created the snapshot
     */
    branch: string;

    /**
     * Sequence number at which the snapshot was taken
     */
    sequenceNumber: number | undefined | null;

    /**
     * Minimum sequence number when the snapshot was taken
     */
    minimumSequenceNumber: number | undefined;

    /**
     * List of clients when the snapshot was taken
     */
    partialOps: Array<[string, string[]]> | null;
}

export enum FileMode {
    File = "100644",
    Executable = "100755",
    Directory = "040000",
    Commit = "160000",
    Symlink = "120000",
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

export interface ICreateBlobResponse {
    id: string;
    url: string;
}

/**
 * A tree entry wraps a path with a type of node
 */
export interface ITreeEntry {
    // Path to the object
    path: string;

    // One of the below enum string values
    type: string;

    // The value of the entry - either a tree or a blob
    value: IBlob | ITree | string;

    // The file mode; one of 100644 for file (blob), 100755 for executable (blob), 040000 for subdirectory (tree),
    // 160000 for submodule (commit), or 120000 for a blob that specifies the path of a symlink
    mode: FileMode;
}

/**
 * Type of entries that can be stored in a tree
 */
export enum TreeEntry {
    Blob,
    Commit,
    Tree,
}

export interface ITree {
    entries: ITreeEntry[];

    // Unique ID representing all entries in the tree. Can be used to optimize snapshotting in the case
    // it is known that the ITree has already been created and stored
    id: string | null;
}

export interface ISnapshotTree {
    id: string | null;
    blobs: { [path: string]: string | null};
    commits: { [path: string]: string | null};
    trees: { [path: string]: ISnapshotTree };
}

/**
 * Represents a version of the snapshot of a component
 */
export interface IVersion  {
    // version ID
    id: string;

    // tree ID for this version of the snapshot
    treeId: string;
}

/**
 * Interface to provide access to stored deltas for a shared object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     */
    get(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]>;
}

/**
 * Interface to provide access to stored deltas for a shared object
 */
export interface IDocumentDeltaStorageService {
    /**
     * Retrieves all the delta operations within the exclusive sequence number range
     */
    get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]>;
}

/**
 * Interface to provide access to snapshots saved for a shared object
 */
export interface IDocumentStorageService {
    repositoryUrl: string;

    /**
     * Returns the snapshot tree.
     */
    getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null | undefined>;

    /**
     * Retrieves all versions of the document starting at the specified commitId - or null if from the head
     */
    getVersions(commitId: string | null, count: number): Promise<IVersion[]>;

    /**
     * Retrieves the content for the given commit at the given path
     */
    getContent(version: IVersion, path: string): Promise<string | undefined>;

    /**
     * Reads the object with the given ID
     */
    read(id: string): Promise<string | undefined>;

    /**
     * Writes to the object with the given ID
     */
    write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion | undefined | null>;

    /**
     * Creates a blob out of the given buffer
     */
    createBlob(file: Buffer | undefined | null): Promise<ICreateBlobResponse>;

    /**
     * Fetch blob Data url
     */
    getRawUrl(blobId: string): string | null | undefined;

    /**
     * Generates and uploads a packfile that represents the given commit. A driver generated handle to the packfile
     * is returned as a result of this call.
     */
    uploadSummary(commit: ISummaryCommit): Promise<ISummaryPackfileHandle>;

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    downloadSummary(handle: ISummaryPackfileHandle): Promise<ISummaryCommit>;
}

// Error tracking service.
export interface IErrorTrackingService {
    /**
     * Track error/exception using a service.
     */
    track(func: () => void);
}

export interface IDocumentDeltaConnection extends EventEmitter {
    /**
     * ClientID for the connection
     */
    clientId: string;

    /**
     * Whether the connection was made to a new or existing document
     */
    existing: boolean;

    /**
     * The parent branch for the document
     */
    parentBranch: string | null;

    /**
     * Maximum size of a message that can be sent to the server. Messages larger than this size must be chunked.
     */
    maxMessageSize: number;

    /**
     * Messages sent during the connection
     */
    initialMessages?: ISequencedDocumentMessage[];

    /**
     * Messages sent during the connection
     */
    initialContents?: IContentMessage[];

    /**
     * Signals sent during the connection
     */
    initialSignals?: ISignalMessage[];

    /**
     * Submit a new message to the server
     */
    submit(message: IDocumentMessage): void;

    /**
     * Async version of the regular submit function.
     */
    // TODO why the need for two of these?
    submitAsync(message: IDocumentMessage): Promise<void>;

    /**
     * Submit a new signal to the server
     */
    submitSignal(message: any): void;

    /**
     * Disconnects the given delta connection
     */
    disconnect();
}

export interface IDocumentService {
    /**
     * Access to storage associated with the document...
     */
    connectToStorage(): Promise<IDocumentStorageService>;

    /**
     * Access to delta storage associated with the document
     */
    connectToDeltaStorage(): Promise<IDocumentDeltaStorageService>;

    /**
     * Subscribes to the document delta stream
     */
    connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection>;

    /**
     * Creates a branch of the document with the given ID. Returns the new ID.
     */
    branch(): Promise<string | null>;

    /**
     * Returns the error tracking service
     */
    getErrorTrackingService(): IErrorTrackingService | null;
}

export interface IDocumentServiceFactory {

    /**
     * returns an instance of IDocumentService
     */
    createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService>;
}
