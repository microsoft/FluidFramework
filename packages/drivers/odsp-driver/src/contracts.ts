/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISnapshot,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { HostStoragePolicy } from "@fluidframework/odsp-driver-definitions/internal";

// eslint-disable-next-line import/no-deprecated
import { ISnapshotContents } from "./odspPublicUtils.js";

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

	/**
	 * Any error supplied by the socket containing codes and inner errors with further
	 * details about the error.
	 */
	error?: unknown;
}

/**
 * Interface for delta storage response.
 * Contains either SequencedDocumentMessages or SequencedDeltaOpMessage.
 */
export interface IDeltaStorageGetResponse {
	value: ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[];
}

export interface ISequencedDeltaOpMessage {
	op: ISequencedDocumentMessage;
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
	groupId?: string;
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
	groupId?: string;
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

	supportGetSnapshotApi?: boolean;
}

export interface ICreateFileResponse {
	"@odata.context": string;
	"driveId": string;
	"id": string;
	"itemId": string;
	"itemUrl": string;
	"sequenceNumber": number;
	// sharing object contains shareId, sharingLink data or error in the response
	// TODO: use a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	"sharing"?: any;
	"sharingLink"?: string;
	"sharingLinkErrorReason"?: string;
	"name": string;
}

export interface IRenameFileResponse {
	"@odata.context": string;
	"id": string;
	"name": string;
}

export interface IVersionedValueWithEpoch {
	// TODO: use a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	fluidEpoch: string;
	// This is same as "persistedCacheValueVersion" below. This represents the version of data stored in cache.
	version: 3;
}

export const persistedCacheValueVersion = 3;

export interface IGetOpsResponse {
	nonce: string;
	code: number;
	/**
	 * Time in seconds. Currently never set by PUSH
	 */
	retryAfter?: number;
	messages?: ISequencedDocumentMessage[];
}

export interface IFlushOpsResponse {
	nonce: string;
	code: number;
	/**
	 * Time in seconds
	 */
	retryAfter?: number;
	lastPersistedSequenceNumber?: number;
}

/**
 * Represents the cached snapshot value.
 * @deprecated - This will be replaced with ISnapshotCachedEntry2 which wraps the new ISnapshot interface.
 * For now, to support back compat from cache, we need to keep it for now.
 */
// eslint-disable-next-line import/no-deprecated
export interface ISnapshotCachedEntry extends ISnapshotContents {
	cacheEntryTime: number;
}

/**
 * Represents the cached snapshot value.
 */
export interface ISnapshotCachedEntry2 extends ISnapshot {
	cacheEntryTime: number;
}

/**
 * Represents the type of signal containing the sensitivity policy labels for the container.
 */
export const policyLabelsUpdatesSignalType = "PolicyLabelsUpdate";
