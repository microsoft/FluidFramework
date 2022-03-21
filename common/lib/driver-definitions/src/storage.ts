/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEventProvider, IErrorEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    ConnectionMode,
    IClient,
    IClientConfiguration,
    ICreateBlobResponse,
    IDocumentMessage,
    INack,
    ISequencedDocumentMessage,
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

export interface IDeltasFetchResult {
    /**
     * Sequential set of messages starting from 'from' sequence number.
     * May be partial result, i.e. not fulfill original request in full.
     */
    messages: ISequencedDocumentMessage[];

    /**
     * If true, storage only partially fulfilled request, but has more ops
     * If false, the request was fulfilled. If less ops were returned then
     * requested, then storage does not have more ops in this range.
     */
    partialResult: boolean;
}

/**
 * Interface to provide access to stored deltas for a shared object
 */
export interface IDeltaStorageService {
    /**
     * Retrieves all the delta operations within the inclusive sequence number range
     * @param tenantId - Id of the tenant.
     * @param id - document id.
     * @param from - first op to retrieve (inclusive)
     * @param to - first op not to retrieve (exclusive end)
     * @param fetchReason - Reason for fetching the messages. Example, gap between seq number
     *  of Op on wire and known seq number. It should not contain any PII. It can be logged by
     *  spo which could help in debugging sessions if any issue occurs.
     */
    get(
        tenantId: string,
        id: string,
        from: number, // inclusive
        to: number, // exclusive
        fetchReason?: string,
    ): Promise<IDeltasFetchResult>;
}

export type IStreamResult<T> = { done: true; } | { done: false; value: T; };

/**
 * Read interface for the Queue
 */
 export interface IStream<T> {
    read(): Promise<IStreamResult<T>>;
}

/**
 * Interface to provide access to stored deltas for a shared object
 */
export interface IDocumentDeltaStorageService {
    /**
     * Retrieves all the delta operations within the exclusive sequence number range
     * @param from - first op to retrieve (inclusive)
     * @param to - first op not to retrieve (exclusive end)
     * @param abortSignal - signal that aborts operation
     * @param cachedOnly - return only cached ops, i.e. ops available locally on client.
     * @param fetchReason - Reason for fetching the messages. Example, gap between seq number
     *  of Op on wire and known seq number. It should not contain any PII. It can be logged by
     *  spo which could help in debugging sessions if any issue occurs.
     */
     fetchMessages(from: number,
        to: number | undefined,
        abortSignal?: AbortSignal,
        cachedOnly?: boolean,
        fetchReason?: string,
    ): IStream<ISequencedDocumentMessage[]>;
}

export interface IDocumentStorageServicePolicies {
    readonly caching?: LoaderCachingPolicy;

    // If this policy is provided, it tells runtime on ideal size for blobs
    // Blobs that are smaller than that size should be aggregated into bigger blobs
    readonly minBlobSize?: number;

    /**
     * This policy tells the runtime that the driver will not use cached snapshots older than this value.
     */
    readonly maximumCacheDurationMs?: number;
}

/**
 * Interface to provide access to snapshots saved for a shared object
 */
export interface IDocumentStorageService extends Partial<IDisposable> {
    repositoryUrl: string;

    /**
     * Policies implemented/instructed by driver.
     */
    readonly policies?: IDocumentStorageServicePolicies;

    /**
     * Returns the snapshot tree.
     */
    getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null>;

    /**
     * Retrieves all versions of the document starting at the specified versionId - or null if from the head
     */
    getVersions(versionId: string | null, count: number): Promise<IVersion[]>;

    /**
     * Writes to the object with the given ID
     */
    write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion>;

    /**
     * Creates a blob out of the given buffer
     */
    createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse>;

    /**
     * Reads the object with the given ID, returns content in arrayBufferLike
     */
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

export interface IDocumentDeltaConnection extends IDisposable, IEventProvider<IDocumentDeltaConnectionEvents> {
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
    serviceConfiguration: IClientConfiguration;

    /**
     * Last known sequence number to ordering service at the time of connection
     * It may lap actual last sequence number (quite a bit, if container  is very active).
     * But it's best information for client to figure out how far it is behind, at least
     * for "read" connections. "write" connections may use own "join" op to similar information,
     * that is likely to be more up-to-date.
     */
    checkpointSequenceNumber?: number;

    /**
     * Properties that server can send to client to tell info about node that client is connected to. For ex, for spo
     * it could contain info like build version, environment, region etc. These properties can be logged by client
     * to better understand server environment etc. and use it in case error occurs.
     * Format: "prop1:val1;prop2:val2;prop3:val3"
     */
    relayServiceAgent?: string,

    /**
     * Submit a new message to the server
     */
    submit(messages: IDocumentMessage[]): void;

    /**
     * Submit a new signal to the server
     */
    submitSignal(message: any): void;
}

export enum LoaderCachingPolicy {
    /**
     * The loader should not implement any prefetching or caching policy.
     */
    NoCaching,

    /**
     * The loader should implement prefetching policy, i.e. it should prefetch resources from the latest snapshot.
     */
    Prefetch,
}

export interface IDocumentServicePolicies {
    /**
     * Do not connect to delta stream
     */
    readonly storageOnly?: boolean;
}

export interface IDocumentService {

    resolvedUrl: IResolvedUrl;

    /**
     * Policies implemented/instructed by driver.
     */
    policies?: IDocumentServicePolicies;

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
     * Dispose storage. Called by storage consumer (Container) when it's done with storage (Container closed).
     * Useful for storage to commit any pending state if any (including any local caching).
     * Please note that it does not remove the need for caller to close all active delta connections,
     * as storage may not be tracking such objects.
     * @param error - tells if container (and storage) are closed due to critical error.
     * Error might be due to disconnect between client & server knowlege about file, like file being overwritten
     * in storage, but client having stale local cache.
     * If driver implements any kind of local caching, such caches needs to be cleared on on critical errors.
     */
    dispose(error?: any): void;
}

export interface IDocumentServiceFactory {
    /**
     * Name of the protocol used by factory
     */
    protocolName: string;

    /**
     * Returns an instance of IDocumentService
     */
     createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService>;

    /**
     * Creates a new document with the provided options. Returns the document service.
     * @param createNewSummary - Summary used to create file. If undefined, an empty file will be created and a summary
     * should be posted later, before connecting to ordering service.
     */
    createContainer(
        createNewSummary: ISummaryTree | undefined,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
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

    readonly referenceSequenceNumber: number;
}
