/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../rebase";
import { Value, Delta, UpPath, FieldKey } from "../tree";

/**
 * An object that can queried for document data that was deleted in prior revisions.
 * @alpha
 */
export interface ReadonlyRepairDataStore<TTree = Delta.ProtoNode> {
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
		revision: RevisionTag,
		path: UpPath | undefined,
		key: FieldKey,
		index: number,
		count: number,
	): TTree[];

	/**
	 * @param revision - The revision at which the value of interest was overwritten.
	 * @param path - The path of the node whose value was overwritten at the given `revision`.
	 * Note that the path must match the original path of the node at the provided `revision`.
	 * WARNING: This may change soon.
	 * @returns The value on the node at the given `path` that was overwritten at the given `revision`.
	 */
	getValue(revision: RevisionTag, path: UpPath): Value;
}

/**
 * An object that captures document data being deleted by changes, and can be queried to retrieve that data.
 * @alpha
 */
export interface RepairDataStore<TTree = Delta.ProtoNode> extends ReadonlyRepairDataStore<TTree> {
	/**
	 * Updates the store so it retains the document data being deleted by the given `change`.
	 * @param change - A change that may be deleting document data that this store should retain.
	 * @param revision - The revision associated with the change.
	 */
	capture(change: Delta.Root, revision: RevisionTag): void;
}
