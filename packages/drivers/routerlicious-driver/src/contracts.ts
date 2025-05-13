/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

/*
 *
 * Whole Snapshot Download Data Structures
 *
 */

export interface IWholeFlatSnapshotTreeEntryTree {
	path: string;
	type: "tree";
	// Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
	unreferenced?: true;
	groupId?: string;
}

export interface IWholeFlatSnapshotTreeEntryBlob {
	id: string;
	path: string;
	type: "blob";
}

export type IWholeFlatSnapshotTreeEntry =
	| IWholeFlatSnapshotTreeEntryTree
	| IWholeFlatSnapshotTreeEntryBlob;

export interface IWholeFlatSnapshotTree {
	entries: IWholeFlatSnapshotTreeEntry[];
	id: string;
	sequenceNumber: number;
}

export interface IWholeFlatSnapshotBlob {
	content: string;
	encoding: "base64" | "utf-8";
	id: string;
	size: number;
}

export interface IWholeFlatSnapshot {
	// The same as the id of the first snapshot tree in the trees array.
	id: string;
	// Receive an array of snapshot trees for future-proofing, however, always length 1 for now.
	trees: IWholeFlatSnapshotTree[];
	blobs?: IWholeFlatSnapshotBlob[];
}

/**
 * Normalized Whole Summary with decoded blobs and unflattened snapshot tree.
 */
export interface INormalizedWholeSnapshot {
	blobs: Map<string, ArrayBuffer>;
	snapshotTree: ISnapshotTree;
	sequenceNumber: number | undefined;
	id: string;
}

/**
 * Error code for when the service drains a cluster to which the socket connection is connected to and it disconnects
 * all the clients in that cluster.
 * @internal
 */
export const R11sServiceClusterDrainingErrorCode = "ClusterDraining";
