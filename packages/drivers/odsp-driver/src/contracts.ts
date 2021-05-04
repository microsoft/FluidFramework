/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/protocol-definitions";
import { HostStoragePolicy } from "@fluidframework/odsp-driver-definitions";

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
     * The client should wait this many milliseconds before retrying its request
     */
    retryAfterMs?: number;
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
    message: string;
    id: string;
}

export enum SnapshotType {
    Container = "container",
    Channel = "channel",
}

export interface IOdspSummaryPayload {
    type: SnapshotType;
    message: string;
    sequenceNumber: number;
    entries: SnapshotTreeEntry[];
}

export interface ISnapshotResponse {
    id: string;
}

export type SnapshotTreeEntry = ISnapshotTreeValueEntry | ISnapshotTreeHandleEntry;

export interface ISnapshotTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface ISnapshotTreeValueEntry extends ISnapshotTreeBaseEntry {
    value: SnapshotTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface ISnapshotTreeHandleEntry extends ISnapshotTreeBaseEntry {
    id: string;
}

export type SnapshotTreeValue = ISnapshotTree | ISnapshotBlob | ISnapshotCommit;

export interface ISnapshotTree {
    type: "tree";
    entries?: SnapshotTreeEntry[];
}

export interface ISnapshotBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}

export interface ISnapshotCommit {
    type: "commit";
    content: string;
}

export interface ITreeEntry {
    id: string;
    path: string;
    type: "commit" | "tree" | "blob";
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface ITree {
    entries: ITreeEntry[];
    id: string;
    sequenceNumber: number;
}

/**
 * Blob content, represents blobs in downloaded snapshot.
 */
export interface IBlob {
    content: string;
    // SPO only uses "base64" today for download.
    // We are adding undefined too, as temp way to roundtrip strings unchanged.
    encoding: "base64" | undefined;
    id: string;
    size: number;
}

export interface IOdspSnapshot {
    id: string;
    trees: ITree[];
    blobs?: IBlob[];
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
}
