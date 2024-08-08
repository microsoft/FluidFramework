/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	type DetachedField,
	type IForestSubscription,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type JsonableTree,
	aboveRootPlaceholder,
	detachedFieldAsKey,
	genericTreeKeys,
	getGenericTreeField,
	mapCursorField,
	moveToDetachedField,
	rootField,
	setGenericTreeField,
} from "../core/index.js";

import {
	type CursorAdapter,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "./treeCursorUtils.js";

/**
 * This module provides support for reading and writing a human readable (and
 * editable) tree format.
 *
 * This implementation can handle all trees (so it does not need a fallback for any special cases),
 * and is not optimized.
 *
 * It's suitable for testing and debugging,
 * though it could also reasonably be used as a fallback for edge cases or for small trees.
 *
 * TODO: Use placeholders.
 * build / add operations should be able to include detached ranges instead of children directly.
 * summaries should be able to reference unloaded chunks instead of having children directly.
 * Leverage placeholders in the types below to accomplish this.
 * Determine how this relates to Cursor: should cursor be generic over placeholder values?
 * (Could use them for errors to allow non erroring cursors?)
 *
 * Note:
 * Currently a lot of Tree's codebase is using json for serialization.
 * Because putting json strings inside json works poorly (adds lots of escaping),
 * for now this library actually outputs and inputs the Json compatible type JsonableTree
 * rather than actual strings.
 */

/**
 * Create a cursor, in `nodes` mode at the root of the provided tree.
 *
 * @returns an {@link ITreeCursorSynchronous} in nodes mode for a single {@link JsonableTree}.
 * @remarks
 * Do not confuse this with {@link JsonableTree} with the JSON domain:
 * this takes in data in a specific format that is json compatible (except for FluidHandle values).
 * That is distinct from treating arbitrary JSON data as a tree in the JSON domain.
 */
export function cursorForJsonableTreeNode(root: JsonableTree): ITreeCursorSynchronous {
	return stackTreeNodeCursor(adapter, root);
}

/**
 * @returns an {@link ITreeCursorSynchronous} in fields mode for a JsonableTree field.
 */
export function cursorForJsonableTreeField(
	trees: JsonableTree[],
	detachedField: DetachedField = rootField,
): ITreeCursorSynchronous {
	const key = detachedFieldAsKey(detachedField);
	return stackTreeFieldCursor(
		adapter,
		{ type: aboveRootPlaceholder, fields: { [key]: trees } },
		detachedField,
	);
}

export const adapter: CursorAdapter<JsonableTree> = {
	value: (node) => node.value,
	type: (node) => node.type,
	keysFromNode: genericTreeKeys,
	getFieldFromNode: (node, key): readonly JsonableTree[] =>
		getGenericTreeField(node, key, false),
};

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromCursor(cursor: ITreeCursor): JsonableTree {
	assert(cursor.mode === CursorLocationType.Nodes, 0x3ba /* must start at node */);
	const node: JsonableTree =
		cursor.value !== undefined
			? {
					type: cursor.type,
					value: cursor.value,
				}
			: {
					type: cursor.type,
				};

	// Normalize object by only including fields that are required.
	for (let inFields = cursor.firstField(); inFields; inFields = cursor.nextField()) {
		const field: JsonableTree[] = mapCursorField(cursor, jsonableTreeFromCursor);
		setGenericTreeField(node, cursor.getFieldKey(), field);
	}
	return node;
}

/**
 * Extract a JsonableTree from the contents of the given ITreeCursor's current node.
 */
export function jsonableTreeFromFieldCursor(cursor: ITreeCursor): JsonableTree[] {
	assert(cursor.mode === CursorLocationType.Fields, 0x7ca /* must start at field */);
	return mapCursorField(cursor, jsonableTreeFromCursor);
}

/**
 * Copy forest content into a JsonableTree.
 * @remarks
 * This is not a time or memory efficient way to pass around forest content:
 * its intended for debugging and testing purposes when forest content is needed in a human readable serializable format.
 */
export function jsonableTreeFromForest(forest: IForestSubscription): JsonableTree[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const jsonable = jsonableTreeFromFieldCursor(readCursor);
	readCursor.free();
	return jsonable;
}
