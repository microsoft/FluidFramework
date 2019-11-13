/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ConnectionMode, IClient, ISignalClient } from "./clients";
import { IServiceConfiguration } from "./config";
import {
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "./protocol";
import { ISummaryHandle, ISummaryTree } from "./summary";
import { ITokenClaims, ITokenProvider } from "./tokens";
import { IResolvedUrl } from "./urlResolver";

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
    blobs: { [path: string]: string };
    commits: { [path: string]: string };
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

    // Time when snapshot was generated.
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
    date?: string;
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
    getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null>;

    /**
     * Retrieves all versions of the document starting at the specified versionId - or null if from the head
     */
    getVersions(versionId: string | null, count: number): Promise<IVersion[]>;

    /**
     * Retrieves the content for the given version at the given path
     */
    getContent(version: IVersion, path: string): Promise<string>;

    /**
     * Reads the object with the given ID
     */
    read(id: string): Promise<string>;

    /**
     * Writes to the object with the given ID
     */
    write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion>;

    /**
     * Creates a blob out of the given buffer
     */
    createBlob(file: Buffer): Promise<ICreateBlobResponse>;

    /**
     * Fetch blob Data url
     */
    getRawUrl(blobId: string): string;

    /**
     * Generates and uploads a packfile that represents the given commit. A driver generated handle to the packfile
     * is returned as a result of this call.
     */
    uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle>;

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree>;
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
     * claims for the client
     */
    claims: ITokenClaims;

    /**
     * mode of the client
     */
    mode: ConnectionMode;

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
     * Protocol version being used with the service
     */
    version: string;

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
     * Prior clients already connected.
     */
    initialClients?: ISignalClient[];

    /**
     * Configuration details provided by the service
     */
    serviceConfiguration: IServiceConfiguration;

    /**
     * Submit a new message to the server
     */
    submit(messages: IDocumentMessage[]): void;

    /**
     * Async version of the regular submit function.
     */
    // TODO why the need for two of these?
    submitAsync(message: IDocumentMessage[]): Promise<void>;

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
    connectToDeltaStream(client: IClient, mode: ConnectionMode): Promise<IDocumentDeltaConnection>;

    /**
     * Creates a branch of the document with the given ID. Returns the new ID.
     */
    branch(): Promise<string>;

    /**
     * Returns the error tracking service
     */
    getErrorTrackingService(): IErrorTrackingService | null;
}

export interface IDocumentServiceFactory {
    /**
     * name of the protocol used by factory
     */
    protocolName: string;

    /**
     * returns an instance of IDocumentService
     */
    createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService>;
}

/**
 * Network errors are communicated from the driver to runtime by throwing object implementing INetworkError interface
 */
export interface INetworkError {
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly retryAfterSeconds?: number;
    readonly online: string;
}
