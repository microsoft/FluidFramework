/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    ICreateBlobResponse,
    IDocumentMessage,
    IErrorTrackingService,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITokenClaims,
    ITokenProvider,
    ITree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { IResolvedUrl } from "./urlResolver";

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
     * DEPRECATED: use uploadSummaryWithContext instead.
     * Generates and uploads a packfile that represents the given commit. A driver generated handle to the packfile
     * is returned as a result of this call.
     * back-compat: 0.14 uploadSummary
     */
    uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle>;

    /**
     * Uploads a summary tree to storage using the given context for reference of previous summary handle.
     * The ISummaryHandles in the uploaded tree should have paths to indicate which summary object they are
     * referencing from the previously acked summary.
     * Returns the uploaded summary handle.
     */
    uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string>;

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree>;
}

export interface IDocumentDeltaConnection extends EventEmitter {
    /**
     * ClientID for the connection
     */
    clientId: string;

    /**
     * Claims for the client
     */
    claims: ITokenClaims;

    /**
     * Mode of the client
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
    connectToDeltaStream(client: IClient, mode?: ConnectionMode): Promise<IDocumentDeltaConnection>;

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
     * Name of the protocol used by factory
     */
    protocolName: string;

    /**
     * Returns an instance of IDocumentService
     */
    createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService>;
}

/**
 * Context for uploading a summary to storage.
 * Indicates the previously acked summary.
 */
export interface ISummaryContext {
    /**
     * Parent summary proposed handle (from summary op)
     */
    readonly proposalHandle: string | undefined;

    /**
     * Parent summary acked handle (from summary ack)
     */
    readonly ackHandle: string | undefined;
}
