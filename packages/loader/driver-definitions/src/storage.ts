/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEventProvider, IErrorEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    ConnectionMode,
    IClient,
    ICreateBlobResponse,
    IDocumentMessage,
    IErrorTrackingService,
    INack,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITokenClaims,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
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
    createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse>;

    readBlob(id: string): Promise<ArrayBufferLike>;

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

export interface IDocumentDeltaConnectionEvents extends IErrorEvent {
    (event: "nack", listener: (documentId: string, message: INack[]) => void);
    (event: "disconnect", listener: (reason: any) => void);
    (event: "op", listener: (documentId: string, messages: ISequencedDocumentMessage[]) => void);
    (event: "signal", listener: (message: ISignalMessage) => void);
    (event: "pong", listener: (latency: number) => void);
    (event: "error", listener: (error: any) => void);
}

export interface IDocumentDeltaConnection extends IEventProvider<IDocumentDeltaConnectionEvents> {
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
    initialMessages: ISequencedDocumentMessage[];

    /**
     * Signals sent during the connection
     */
    initialSignals: ISignalMessage[];

    /**
     * Prior clients already connected.
     */
    initialClients: ISignalClient[];

    /**
     * Configuration details provided by the service
     */
    serviceConfiguration: IServiceConfiguration;

    /**
     * Last known sequence number to ordering service at the time of connection
     * It may lap actual last sequence number (quite a bit, if container  is very active).
     * But it's best information for client to figure out how far it is behind, at least
     * for "read" connections. "write" connections may use own "join" op to similar information,
     * that is likely to be more up-to-date.
     */
    checkpointSequenceNumber?: number;

    /**
     * Submit a new message to the server
     */
    submit(messages: IDocumentMessage[]): void;

    /**
     * Submit a new signal to the server
     */
    submitSignal(message: any): void;

    /**
     * Disconnects the given delta connection
     */
    close(): void;
}

export interface IDocumentService {

    resolvedUrl: IResolvedUrl;

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
    createDocumentService(resolvedUrl: IResolvedUrl, logger?: ITelemetryBaseLogger): Promise<IDocumentService>;

    // Creates a new document on the host with the provided options. Returns the document service.
    createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService>;
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
