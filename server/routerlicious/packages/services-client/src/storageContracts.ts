/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISnapshotTree,
	ISummaryHandle,
	ISummaryTree as BaseSummaryTree,
	SummaryObject,
} from "@fluidframework/protocol-definitions";

/*
 *
 * Whole Summary Upload Data Structures
 *
 */

/**
 * @internal
 */
export type IWholeSummaryPayloadType = "container" | "channel";

/**
 * @internal
 */
export interface IWholeSummaryPayload {
	type: IWholeSummaryPayloadType;
	message: string;
	sequenceNumber: number;
	entries: WholeSummaryTreeEntry[];
}

/**
 * @internal
 */
export interface IWriteSummaryResponse {
	id: string;
}

/**
 * @internal
 */
export type WholeSummaryTreeEntry = IWholeSummaryTreeValueEntry | IWholeSummaryTreeHandleEntry;

/**
 * @internal
 */
export interface IWholeSummaryTreeBaseEntry {
	path: string;
	type: "blob" | "tree" | "commit";
}

/**
 * @internal
 */
export interface IWholeSummaryTreeValueEntry extends IWholeSummaryTreeBaseEntry {
	value: WholeSummaryTreeValue;
	// Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
	unreferenced?: true;
}

/**
 * @internal
 */
export interface IWholeSummaryTreeHandleEntry extends IWholeSummaryTreeBaseEntry {
	id: string;
}

/**
 * @internal
 */
export type WholeSummaryTreeValue = IWholeSummaryTree | IWholeSummaryBlob;

/**
 * @internal
 */
export interface IWholeSummaryTree {
	type: "tree";
	entries?: WholeSummaryTreeEntry[];
}

/**
 * @internal
 */
export interface IWholeSummaryBlob {
	type: "blob";
	content: string;
	encoding: "base64" | "utf-8";
}

/**
 * @internal
 */
export interface IEmbeddedSummaryHandle extends ISummaryHandle {
	// Indicates that the handle belongs to the same version of summary
	embedded: boolean;
}

/**
 * @internal
 */
export type ExtendedSummaryObject = SummaryObject | IEmbeddedSummaryHandle;

/**
 * @internal
 */
export interface ISummaryTree extends BaseSummaryTree {
	tree: { [path: string]: ExtendedSummaryObject };
}

/*
 *
 * Whole Summary Download Data Structures
 *
 */

/**
 * @internal
 */
export interface IWholeFlatSummaryTreeEntryTree {
	path: string;
	type: "tree";
	// Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
	unreferenced?: true;
}

/**
 * @internal
 */
export interface IWholeFlatSummaryTreeEntryBlob {
	id: string;
	path: string;
	type: "blob";
}

/**
 * @internal
 */
export type IWholeFlatSummaryTreeEntry =
	| IWholeFlatSummaryTreeEntryTree
	| IWholeFlatSummaryTreeEntryBlob;

/**
 * @internal
 */
export interface IWholeFlatSummaryTree {
	entries: IWholeFlatSummaryTreeEntry[];
	id: string;
	sequenceNumber: number;
}

/**
 * @internal
 */
export interface IWholeFlatSummaryBlob {
	content: string;
	encoding: "base64" | "utf-8";
	id: string;
	size: number;
}

/**
 * @internal
 */
export interface IWholeFlatSummary {
	// The same as the id of the first snapshot tree in the trees array.
	id: string;
	// Receive an array of snapshot trees for future-proofing, however, always length 1 for now.
	trees: IWholeFlatSummaryTree[];
	blobs?: IWholeFlatSummaryBlob[];
}

/**
 * Normalized Whole Summary with decoded blobs and unflattened snapshot tree.
 * @internal
 */
export interface INormalizedWholeSummary {
	blobs: Map<string, ArrayBuffer>;
	snapshotTree: ISnapshotTree;
	sequenceNumber: number | undefined;
}
