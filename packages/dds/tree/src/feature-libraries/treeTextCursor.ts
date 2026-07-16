/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	type DetachedField,
	type FieldKey,
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
 * Creates an {@link ITreeCursorSynchronous} in fields mode for a JsonableTree field.
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
		cursor.value === undefined
			? {
					type: cursor.type,
				}
			: {
					type: cursor.type,
					value: cursor.value,
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

/**
 * Extracts the full contents of a forest (every detached field, keyed by field key) as {@link JsonableTree}s.
 */
function detachedFieldsContent(forest: IForestSubscription): Map<FieldKey, JsonableTree[]> {
	const cursor = forest.getCursorAboveDetachedFields();
	const content = new Map<FieldKey, JsonableTree[]>();
	for (let hasField = cursor.firstField(); hasField; hasField = cursor.nextField()) {
		content.set(cursor.getFieldKey(), mapCursorField(cursor, jsonableTreeFromCursor));
	}
	return content;
}

/**
 * Structural equality for the {@link JsonableTree} content of two forests, keyed by detached field.
 *
 * @remarks
 * Fields are compared as an unordered set of keys, so this is independent of the order in which different
 * forest implementations enumerate fields. The nodes within each field are compared in order.
 *
 * Implemented iteratively (using an explicit work stack rather than recursion) so that comparing deeply
 * nested trees does not risk exhausting the call stack.
 */
function forestContentEquals(
	a: ReadonlyMap<FieldKey, JsonableTree[]>,
	b: ReadonlyMap<FieldKey, JsonableTree[]>,
): boolean {
	// Aligned pairs of nodes still to be compared.
	const stack: [JsonableTree, JsonableTree][] = [];

	// Queue each aligned pair of nodes from the two fields for comparison.
	// Returns false if the fields have differing numbers of nodes.
	const queueFieldNodes = (aNodes: JsonableTree[], bNodes: JsonableTree[]): boolean => {
		if (aNodes.length !== bNodes.length) {
			return false;
		}
		for (let index = 0; index < aNodes.length; index += 1) {
			// The two fields have equal length (checked above), so both nodes are defined.
			stack.push([aNodes[index] ?? oob(), bNodes[index] ?? oob()]);
		}
		return true;
	};

	if (a.size !== b.size) {
		return false;
	}
	for (const [key, aNodes] of a) {
		const bNodes = b.get(key);
		if (bNodes === undefined || !queueFieldNodes(aNodes, bNodes)) {
			return false;
		}
	}

	for (let pair = stack.pop(); pair !== undefined; pair = stack.pop()) {
		const [aNode, bNode] = pair;
		if (aNode.type !== bNode.type || !Object.is(aNode.value, bNode.value)) {
			return false;
		}
		// JsonableTree never stores empty fields, so equal key counts plus a matching (non-empty) field
		// for every key in `aNode` implies `bNode` has no extra fields.
		const aKeys = genericTreeKeys(aNode);
		if (aKeys.length !== genericTreeKeys(bNode).length) {
			return false;
		}
		for (const key of aKeys) {
			if (
				!queueFieldNodes(
					getGenericTreeField(aNode, key, false),
					getGenericTreeField(bNode, key, false),
				)
			) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Best-effort human readable serialization of forest content for error messages.
 * Falls back to a placeholder if the content is too deeply nested to serialize.
 */
function describeContent(content: ReadonlyMap<FieldKey, JsonableTree[]>): string {
	try {
		return JSON.stringify(Object.fromEntries(content));
	} catch {
		return "<content too large to serialize>";
	}
}

/**
 * Returns true if `a` and `b` have identical contents, including all detached/removed fields.
 * @remarks
 * Only the content is compared: schema, anchors and other forest state are ignored.
 * This is intended for debugging and testing, and is not optimized.
 */
export function forestsEqual(a: IForestSubscription, b: IForestSubscription): boolean {
	return forestContentEquals(detachedFieldsContent(a), detachedFieldsContent(b));
}

/**
 * Asserts that `a` and `b` have identical contents, including all detached/removed fields.
 * @throws an Error describing the divergence if the forests differ.
 * @remarks
 * Only the content is compared: schema, anchors and other forest state are ignored.
 * This is intended for debugging and testing, and is not optimized.
 */
export function assertForestsEqual(a: IForestSubscription, b: IForestSubscription): void {
	const aContent = detachedFieldsContent(a);
	const bContent = detachedFieldsContent(b);
	if (!forestContentEquals(aContent, bContent)) {
		fail(
			"Forests are not equal",
			() => `A: ${describeContent(aContent)}\nB: ${describeContent(bContent)}`,
		);
	}
}
