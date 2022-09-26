/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/protocol-definitions";
import { HostStoragePolicy } from "@fluidframework/odsp-driver-definitions";
import { ISnapshotContents } from "./odspPublicUtils";

/**
 * Socket storage discovery api response
 */
export interface ISocketStorageDiscovery {
    // The id of the web socket
    id: string;

    // SPO gives us runtimeTenantId, we remap it to tenantId
    // See getSocketStorageDiscovery
    runtimeTenantId?: string;
    tenantId: string;

    snapshotStorageUrl: string;
    deltaStorageUrl: string;

    /**
     * PUSH URL
     */
    deltaStreamSocketUrl: string;

    /**
     * The access token for PushChannel. Optionally returned, depending on implementation.
     * OneDrive for Consumer implementation returns it and OneDrive for Business implementation
     * does not return it and instead expects token to be returned via `getWebsocketToken` callback
     * passed as a parameter to `OdspDocumentService.create()` factory.
     */
    socketToken?: string;

    /**
     * This is the time within which client has to refresh the session on (ODSP) relay service.
     */
    refreshSessionDurationSeconds?: number;
}

/**
 * Interface for error responses for the WebSocket connection
 */
export interface IOdspSocketError {
    /**
     * An error code number for the error that occurred
     * It will be a valid HTTP status code
     */
    code: number;

    /**
     * A message about the error that occurred for debugging / logging purposes
     * This should not be displayed to the user directly
     */
    message: string;

    /**
     * Optional Retry-After time in seconds
     * The client should wait this many seconds before retrying its request
     */
    retryAfter?: number;
}

/**
 * Interface for delta storage response.
 * Contains either SequencedDocumentMessages or SequencedDeltaOpMessage.
 */
export interface IDeltaStorageGetResponse {
    value: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[];
}

export interface ISequencedDeltaOpMessage {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}

export interface IDocumentStorageGetVersionsResponse {
    value: IDocumentStorageVersion[];
}

export interface IDocumentStorageVersion {
    id: string;
}

/**
 *
 * Data structures that form ODSP Summary
 *
 */

export interface IOdspSummaryPayload {
    type: "container" | "channel";
    message: string;
    sequenceNumber: number;
    entries: OdspSummaryTreeEntry[];
}

export interface IWriteSummaryResponse {
    id: string;
}

export type OdspSummaryTreeEntry = IOdspSummaryTreeValueEntry | IOdspSummaryTreeHandleEntry;

export interface IOdspSummaryTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface IOdspSummaryTreeValueEntry extends IOdspSummaryTreeBaseEntry {
    value: OdspSummaryTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface IOdspSummaryTreeHandleEntry extends IOdspSummaryTreeBaseEntry {
    id: string;
}

export type OdspSummaryTreeValue = IOdspSummaryTree | IOdspSummaryBlob;

export interface IOdspSummaryTree {
    type: "tree";
    entries?: OdspSummaryTreeEntry[];
}

export interface IOdspSummaryBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}

/**
 *
 * Data structures that form ODSP Snapshot
 *
 */

export interface IOdspSnapshotTreeEntryTree {
    path: string;
    type: "tree";
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface IOdspSnapshotTreeEntryCommit {
    id: string;
    path: string;
    type: "commit";
}

export interface IOdspSnapshotTreeEntryBlob {
    id: string;
    path: string;
    type: "blob";
}

export type IOdspSnapshotTreeEntry =
    | IOdspSnapshotTreeEntryTree
    | IOdspSnapshotTreeEntryCommit
    | IOdspSnapshotTreeEntryBlob;

export interface IOdspSnapshotCommit {
    entries: IOdspSnapshotTreeEntry[];
    id: string;
    sequenceNumber: number;
}

/**
 * Blob content, represents blobs in downloaded snapshot.
 */
export interface IOdspSnapshotBlob {
    content: string;
    // SPO only uses "base64" today for download.
    // We are adding undefined too, as temp way to roundtrip strings unchanged.
    encoding: "base64" | undefined;
    id: string;
    size: number;
}

export interface IOdspSnapshot {
    id: string;
    trees: IOdspSnapshotCommit[];
    blobs?: IOdspSnapshotBlob[];
    ops?: ISequencedDeltaOpMessage[];
}

/**
 * Same as HostStoragePolicy, but adds options that are internal to runtime.
 * All fields should be optional.
 */
export interface HostStoragePolicyInternal extends HostStoragePolicy {
    summarizerClient?: boolean;
}

export interface ICreateFileResponse {
    "@odata.context": string;
    driveId: string;
    id: string;
    itemId: string;
    itemUrl: string;
    sequenceNumber: number;
    // sharing object contains shareId, sharingLink data or error in the response
    sharing?: any;
    sharingLink?: string;
    sharingLinkErrorReason?: string;
}

export interface IVersionedValueWithEpoch {
    value: any;
    fluidEpoch: string;
    // This is same as "persistedCacheValueVersion" below. This represents the version of data stored in cache.
    version: 3;
}

export const persistedCacheValueVersion = 3;

export interface IGetOpsResponse {
    nonce: string;
    code: number;
    /** Time in seconds. Currently never set by PUSH */
    retryAfter?: number;
    messages?: api.ISequencedDocumentMessage[];
}

export interface IFlushOpsResponse {
    nonce: string;
    code: number;
    /** Time in seconds */
    retryAfter?: number;
    lastPersistedSequenceNumber?: number;
}

/**
 * Represents the cached snapshot value.
 */
export interface ISnapshotCachedEntry extends ISnapshotContents {
    cacheEntryTime: number;
}
