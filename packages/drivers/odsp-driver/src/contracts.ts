/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";

export interface IOdspResolvedUrl extends IFluidResolvedUrl {
    type: "fluid";

    // URL to send to fluid, contains the documentId and the path
    url: string;

    // A hashed identifier that is unique to this document
    hashedDocumentId: string;

    siteUrl: string;

    driveId: string;

    itemId: string;

    endpoints: {
        snapshotStorageUrl: string;
        attachmentPOSTStorageUrl: string;
        attachmentGETStorageUrl: string;
    };

    // Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
    // eslint-disable-next-line @typescript-eslint/ban-types
    tokens: {};

    fileName: string;

    summarizer: boolean;

    sharingLink?: string;

    codeHint?: {
        // containerPackageName is used for adding the package name to the request headers.
        // This may be used for preloading the container package when loading fluid content.
        containerPackageName?: string
    }
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

    deltaStreamSocketUrl: string;

    // The AFD URL for PushChannel
    deltaStreamSocketUrl2?: string;
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
    id: string;
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
    id: string;
}

export type SnapshotTreeEntry = ISnapshotTreeValueEntry | ISnapshotTreeHandleEntry;

export interface ISnapshotTreeBaseEntry {
    path: string;
    type: string;
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
    id: string;
    path: string;
    type: "commit" | "tree" | "blob";
}

export interface ITree {
    entries: ITreeEntry[];
    id: string;
    sequenceNumber: number;
}

/**
 * Blob content
 */
export interface IBlob {
    content: string;
    encoding: string;
    id: string;
    size: number;
}

export interface IOdspSnapshot {
    id: string;
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
     * If specified, SPO will fail snapshot request with 413 error (see OdspErrorType.snapshotTooBig)
     * if snapshot is bigger in size than specified limit.
     */
    mds?: number;
}

export interface HostStoragePolicy {
    snapshotOptions?: ISnapshotOptions;

    /**
     * If set to true, tells driver to concurrently fetch snapshot from storage (SPO) and cache
     * Container loads from whatever comes first in such case.
     * Snapshot fetched from storage is pushed to cache in either case.
     * If set to false, driver will first consult with cache. Only on cache miss (cache does not
     * return snapshot), driver will fetch snapshot from storage (and push it to cache), otherwise
     * it will load from cache and not reach out to storage.
     * Passing true results in faster loads and keeping cache more current, but it increases bandwidth consumption.
     */
    concurrentSnapshotFetch?: boolean;

    /**
     * Use post call to fetch the latest snapshot
     */
    usePostForTreesLatest?: boolean;
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

export interface OdspDocumentInfo {
    siteUrl: string;
    driveId: string;
    fileId: string;
    dataStorePath: string;
}

export interface OdspFluidDataStoreLocator {
    siteUrl: string;
    driveId: string;
    fileId: string;
    dataStorePath: string;
    appName?: string;
    containerPackageName?: string;
}

export enum SharingLinkHeader {
    isSharingLink = "isSharingLink",
    generateSharingLink = "generateSharingLink",
}

export interface ISharingLinkHeader {
    [SharingLinkHeader.isSharingLink]: boolean;
    [SharingLinkHeader.generateSharingLink]: boolean;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<ISharingLinkHeader> { }
}
