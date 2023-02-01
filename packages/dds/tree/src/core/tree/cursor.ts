/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldUpPath, UpPath } from "./pathTree";
import { FieldKey, TreeType, Value } from "./types";

/**
 * A stateful low-level interface for reading tree data.
 * @alpha
 */
export interface ITreeCursor {
	/**
	 * What kind of place the cursor is at.
	 * Determines which operations are allowed.
	 */
	readonly mode: CursorLocationType;

	/*
	 * True iff the current field or node (depending on mode) is "pending",
	 * meaning that it has not been downloaded.
	 */
	readonly pending: boolean;

	// ********** APIs for when mode = Fields ********** //

	/**
	 * Moves the "current field" forward one in an arbitrary field traversal order,
	 * skipping any empty fields.
	 *
	 * If there is no remaining field to iterate to,
	 * returns false and navigates up to the parent setting the mode to `Nodes`.
	 *
	 * Order of fields is only guaranteed to be consistent thorough a single iteration.
	 *
	 * If skipPending, skip past fields which are currently pending.
	 * This can be used to skip to the end of a large number of consecutive pending fields.
	 *
	 * Allowed when `mode` is `Fields`.
	 */
	nextField(): boolean;

	/**
	 * Navigate up to parent node.
	 * Sets mode to `Nodes`
	 *
	 * Only valid when `mode` is `Fields`.
	 *
	 * TODO: what to do if at root?
	 */
	exitField(): void;

	/**
	 * Moves the "current field" forward until `pending` is `false`.
	 *
	 * If there are no remaining field to iterate to,
	 * returns false and navigates up to the parent setting the mode to `Nodes`.
	 *
	 * Order of fields is only guaranteed to be consistent thorough a single iteration.
	 *
	 * Allowed when `mode` is `Fields`.
	 */
	skipPendingFields(): boolean;

	// ********** APIs for when mode = Fields, and not pending ********** //

	/**
	 * Returns the FieldKey for the current field.
	 *
	 * Allowed when `mode` is `Fields`, and not `pending`.
	 */
	getFieldKey(): FieldKey;

	/**
	 * @returns the number of immediate children in the current field.
	 *
	 * Allowed when `mode` is `Fields`, and not `pending`.
	 */
	getFieldLength(): number;

	/**
	 * Moves to the first node of the selected field, setting mode to `Nodes`.
	 *
	 * If field is empty, returns false instead.
	 *
	 * Allowed when `mode` is `Fields`, and not `pending`.
	 */
	firstNode(): boolean;

	/**
	 * Sets current node to the node at the provided `index` of the current field.
	 *
	 * Allowed when `mode` is `Fields`, and not `pending`.
	 * Sets mode to `Nodes`.
	 */
	enterNode(childIndex: number): void;

	/**
	 * Returns a path to the current field. See {@link FieldUpPath}.
	 *
	 * Only valid when `mode` is `Fields`.
	 *
	 * If no prefix is provided, assumes this cursor is treated as if it has a root node where its field keys are actually detached sequences.
	 * If the cursor is not rooted at such a node, the `prefix` should be used to ensure the path has the correct root.
	 * This requirement exists because {@link FieldUpPath}s are absolute paths
	 * and thus must be rooted in a detached sequence.
	 *
	 * @param prefix - optional overrides to apply to the root of the returned path.
	 * See {@link PathRootPrefix}.
	 * This adjusts the path as if the tree data accessible to this cursor is part of a larger tree.
	 *
	 * @returns a path to the current field.
	 */
	getFieldPath(prefix?: PathRootPrefix): FieldUpPath;

	// ********** APIs for when mode = Nodes ********** //

	/**
	 * Returns a path to the current node. See {@link UpPath}.
	 *
	 * Only valid when `mode` is `Nodes`.
	 *
	 * If no prefix is provided, assumes this cursor is treated as if it has a root node where its field keys are actually detached sequences.
	 * If the cursor is not rooted at such a node, the `prefix` should be used to ensure the path has the correct root.
	 * This requirement exists because {@link UpPath}s are absolute paths
	 * and thus must be rooted in a detached sequence.
	 *
	 * @param prefix - optional overrides to apply to the root of the returned path.
	 * See {@link PathRootPrefix}.
	 * This adjusts the path as if the tree data accessible to this cursor is part of a larger tree.
	 *
	 * @returns a path to the current node.
	 */
	getPath(prefix?: PathRootPrefix): UpPath | undefined;

	/**
	 * Index (within its parent field) of the current node.
	 *
	 * Only valid when `mode` is `Nodes`.
	 */
	readonly fieldIndex: number;

	/**
	 * Index (within its parent field) of the first node in the current chunk.
	 * Always less than or equal to `currentIndexInField`.
	 *
	 * Only valid when `mode` is `Nodes`.
	 */
	readonly chunkStart: number;

	/**
	 * Length of current chunk.
	 * Since an entire chunk always has the same `pending` value,
	 * can be used to help skip over all of a pending chunk at once.
	 *
	 * TODO:
	 * Add optional APIs to access underlying chunks so readers can
	 * accelerate processing of chunk formats they understand.
	 *
	 * Only valid when `mode` is `Nodes`.
	 */
	readonly chunkLength: number;

	/**
	 * Moves `offset` nodes in the field.
	 * If seeking to exactly past either end,
	 * returns false and navigates up to the parent field (setting mode to `Fields`).
	 *
	 * Allowed if mode is `Nodes`.
	 */
	seekNodes(offset: number): boolean;

	/**
	 * The same as `seekNodes(1)`, but might be faster.
	 */
	nextNode(): boolean;

	/**
	 * Navigate up to parent field.
	 * Sets mode to `Fields`
	 *
	 * Same as seek Number.POSITIVE_INFINITY, but only valid when `mode` is `Nodes`.
	 *
	 * TODO: what to do if at root?
	 * TODO: Maybe merge with upToNode to make a single "Up"?
	 */
	exitNode(): void;

	// ********** APIs for when mode = Nodes and not pending ********** //

	/**
	 * Enters the first non-empty field (setting mode to `Fields`)
	 * so fields can be iterated with `nextField` and `skipPendingFields`.
	 *
	 * If there are no fields, mode is returned to `Nodes` and false is returned.
	 *
	 * Allowed when `mode` is `Nodes` and not `pending`.
	 */
	firstField(): boolean;

	/**
	 * Navigate to the field with the specified `key` and set the mode to `Fields`.
	 *
	 * Only valid when `mode` is `Nodes`, and not `pending`.
	 */
	enterField(key: FieldKey): void;

	/**
	 * The type of the currently selected node.
	 *
	 * Only valid when `mode` is `Nodes`, and not `pending`.
	 */
	readonly type: TreeType;

	/**
	 * The value associated with the currently selected node.
	 *
	 * Only valid when `mode` is `Nodes`, and not `pending`.
	 */
	readonly value: Value;
}

/**
 * Prefix to apply as the root of a {@link UpPath} or {@link FieldUpPath}.
 *
 * @remarks This can be used to take a path relative to a subtree, and make it relative to a larger containing tree.
 * For example, if a node is being inserted in the 5th position in a field "Foo", you can update a path in that node's subtree to its new path by prefixing it with
 * `{ parent: theNodeAboveTheMovedNode, rootFieldOverride: Foo, indexOffset: 5 }`.
 * See {@link prefixPath} and {@link prefixFieldPath} for how to apply the prefix to the paths.
 * @alpha
 */
export interface PathRootPrefix {
	/**
	 * The new parent to place above root of the path which is being prefixed.
	 * This replaces the `undefined` at the root of the path.
	 *
	 * @remarks specifying `undefined` here results in no change to the path.
	 */
	parent?: UpPath | undefined;

	/**
	 * The field of `parent` that the original path will be included under.
	 *
	 * If `undefined` the root field key from the original path will be used.
	 */
	rootFieldOverride?: FieldKey;

	/**
	 * Offset to add to the uppermost `parentIndex` in the original path.
	 */
	indexOffset?: number;
}

/**
 * @alpha
 */
export const enum CursorLocationType {
	/**
	 * Can iterate through nodes in a field.
	 * At a "current node".
	 */
	Nodes,

	/**
	 * Can iterate through fields of a node.
	 * At a "current field".
	 */
	Fields,
}

/**
 * {@link ITreeCursor} that is never pending.
 * @alpha
 */
export interface ITreeCursorSynchronous extends ITreeCursor {
	readonly pending: false;
}

/**
 * @param cursor - tree whose fields will be visited.
 * @param f - builds output from field, which will be selected in cursor when cursor is provided.
 * If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 * @returns array resulting from applying `f` to each field of the current node on `cursor`.
 * Returns an empty array if the node is empty or not present (which are considered the same).
 * Note that order is not specified for field iteration.
 */
export function mapCursorFields<T, TCursor extends ITreeCursor = ITreeCursor>(
	cursor: TCursor,
	f: (cursor: TCursor) => T,
): T[] {
	const output: T[] = [];
	forEachField(cursor, (c) => {
		output.push(f(c));
	});
	return output;
}

/**
 * @param cursor - cursor at a node whose fields will be visited.
 * @param f - For on each field.
 * If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 */
export function forEachField<TCursor extends ITreeCursor = ITreeCursor>(
	cursor: TCursor,
	f: (cursor: TCursor) => void,
): void {
	assert(cursor.mode === CursorLocationType.Nodes, 0x411 /* should be in nodes */);
	for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
		f(cursor);
	}
}

/**
 * @param cursor - tree whose field will be visited.
 * @param f - builds output from field member, which will be selected in cursor when cursor is provided.
 * If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 * @returns array resulting from applying `f` to each item of the current field on `cursor`.
 * Returns an empty array if the field is empty or not present (which are considered the same).
 */
export function mapCursorField<T, TCursor extends ITreeCursor = ITreeCursor>(
	cursor: TCursor,
	f: (cursor: TCursor) => T,
): T[] {
	const output: T[] = [];
	forEachNode(cursor, (c) => {
		output.push(f(c));
	});
	return output;
}

/**
 * @param cursor - cursor at a field whose nodes will be visited.
 * @param f - For on each node.
 * If `f` moves cursor, it must put it back to where it was at the beginning of `f` before returning.
 */
export function forEachNode<TCursor extends ITreeCursor = ITreeCursor>(
	cursor: TCursor,
	f: (cursor: TCursor) => void,
): void {
	assert(cursor.mode === CursorLocationType.Fields, 0x3bd /* should be in fields */);
	for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
		f(cursor);
	}
}
