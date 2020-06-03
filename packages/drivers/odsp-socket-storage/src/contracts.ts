/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrlBase } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";
import { INewFileInfoHeader } from "./odspUtils";

export interface IOdspResolvedUrl extends IResolvedUrlBase {
    type: "fluid";

    // URL to send to fluid, contains the documentId and the path
    url: string;

    createNewOptions?: INewFileInfoHeader;

    // A hashed identifier that is unique to this document
    hashedDocumentId: string;

    siteUrl: string;

    driveId: string;

    itemId: string;

    endpoints: {
        snapshotStorageUrl: string;
    };

    // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
    tokens: {};

    fileName: string,
}

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
    storageToken: string;

    deltaStreamSocketUrl: string;

    // The AFD URL for PushChannel
    deltaStreamSocketUrl2?: string;
    socketToken: string;
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
    message: string;

    // Interchangeable, one of them is there.
    sha?: string;
    id?: string;
}

export enum SnapshotType {
    Container = "container",
    Channel = "channel",
}

export interface ISnapshotRequest {
    type: SnapshotType;
    message: string;
    sequenceNumber: number;
    entries: SnapshotTreeEntry[];
}

export interface ISnapshotResponse {
    // Interchangeable, one of them is there.
    sha?: string;
    id?: string;
}

export type SnapshotTreeEntry = ISnapshotTreeValueEntry | ISnapshotTreeHandleEntry;

export interface ISnapshotTreeBaseEntry {
    path: string;
    type: string;
    mode: string;
}

export interface ISnapshotTreeValueEntry extends ISnapshotTreeBaseEntry {
    id?: string;
    value: SnapshotTreeValue;
}

export interface ISnapshotTreeHandleEntry extends ISnapshotTreeBaseEntry {
    id: string;
}

export type SnapshotTreeValue = ISnapshotTree | ISnapshotBlob | ISnapshotCommit;

export interface ISnapshotTree {
    id?: string;
    sha?: string;
    entries?: SnapshotTreeEntry[];
}

export interface ISnapshotBlob {
    contents?: string;
    content?: string;
    encoding: string;
}

export interface ISnapshotCommit {
    content: string;
}

export interface ITreeEntry {
    // Interchangeable, one of them is there.
    id?: string;
    sha?: string;

    path: string;
    type: "commit" | "tree" | "blob";
}

export interface ITree {
    entries: ITreeEntry[];

    // Interchangeable, one of them is there.
    id?: string;
    sha?: string;

    sequenceNumber: number;
}

export function idFromSpoEntry(tree: { id?: string; sha?: string;}) {
    return (tree.sha ?? tree.id) as string;
}

/**
 * Blob content
 */
export interface IBlob {
    content: string;
    encoding: string;
    id?: string;
    sha?: string;
    size: number;
}

export interface IOdspSnapshot {
    id: string;
    sha?: string;
    trees: ITree[];
    blobs?: IBlob[];
    ops?: ISequencedDeltaOpMessage[];
}

export interface IOdspUrlParts {
    site: string;
    drive: string;
    item: string;
}

export interface ISnapshotOptions {
    blobs?: number;
    deltas?: number;
    channels?: number;
    /*
     * Maximum Data size (in bytes)
     * If specified, SPO will fail snapshot request with 413 error (see ErrorType.snapshotTooBig)
     * if snapshot is bigger in size than specified limit.
     */
    mds?: number;
}

export interface HostStoragePolicy {
    snapshotOptions?: ISnapshotOptions;
}
