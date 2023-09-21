/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../schema-stored";
import { Delta, UpPath } from "../tree";

/**
 * An object that can queried for document data that was deleted in prior revisions.
 * @alpha
 */
export interface ReadonlyRepairDataStore<TTree = Delta.ProtoNode, TRevisionTag = unknown> {
	/**
	 * @param revision - The revision at which the nodes of interest were deleted.
	 * @param path - The path of the node under which the nodes were deleted.
	 * Note that the path must match the original path of the node at the provided `revision`.
	 * WARNING: This may change soon.
	 * @param key - The key of the field under under which the nodes were deleted.
	 * @param index - The index of the first deleted node among the nodes of interest.
	 * Note that the index must match the original index of the desired node at the provided `revision`.
	 * @param count - The number of consecutive deleted nodes to get the repair data for.
	 * @returns An array that contains the document data for the `count` nodes that were contiguously deleted at the
	 * given `revision` starting at the given `index` under the field with the given `key` of the node at the given
	 * `path`.
	 */
	getNodes(
		revision: TRevisionTag,
		path: UpPath | undefined,
		key: FieldKey,
		index: number,
		count: number,
	): TTree[];
}

/**
 * An object that captures document data being deleted by changes, and can be queried to retrieve that data.
 * @alpha
 */
export interface RepairDataStore<TChange, TTree = Delta.ProtoNode, TRevisionTag = unknown>
	extends ReadonlyRepairDataStore<TTree, TRevisionTag> {
	/**
	 * Updates the store so it retains the document data being deleted by the given `change`.
	 * @param change - A change that may be deleting document data that this store should retain.
	 * @param revision - The revision associated with the change.
	 */
	capture(change: TChange, revision: TRevisionTag): void;
}
