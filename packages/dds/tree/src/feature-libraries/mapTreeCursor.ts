/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	type DetachedField,
	type FieldKey,
	type ITreeCursor,
	type MapTree,
	aboveRootPlaceholder,
	detachedFieldAsKey,
	mapCursorField,
	rootField,
} from "../core/index.js";

import {
	type CursorAdapter,
	type CursorWithNode,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "./treeCursorUtils.js";

/**
 * @returns An {@link ITreeCursorSynchronous} in nodes mode for a single {@link MapTree}.
 */
export function cursorForMapTreeNode(root: MapTree): CursorWithNode<MapTree> {
	return stackTreeNodeCursor(adapter, root);
}

/**
 * @returns an {@link ITreeCursorSynchronous} in fields mode for a MapTree field.
 */
export function cursorForMapTreeField(
	root: MapTree[],
	detachedField: DetachedField = rootField,
): CursorWithNode<MapTree> {
	const key = detachedFieldAsKey(detachedField);
	return stackTreeFieldCursor(
		adapter,
		{
			type: aboveRootPlaceholder,
			fields: new Map([[key, root]]),
		},
		detachedField,
	);
}

const adapter: CursorAdapter<MapTree> = {
	value: (node) => node.value,
	type: (node) => node.type,
	keysFromNode: (node) => [...node.fields.keys()], // TODO: don't convert this to array here.
	getFieldFromNode: (node, key) => node.fields.get(key) ?? [],
};

/**
 * Extract a MapTree from the contents of the given ITreeCursor's current node.
 */
export function mapTreeFromCursor(cursor: ITreeCursor): MapTree {
	assert(cursor.mode === CursorLocationType.Nodes, 0x3b7 /* must start at node */);
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
		const field: MapTree[] = mapCursorField(cursor, mapTreeFromCursor);
		fields.set(cursor.getFieldKey(), field);
	}

	const node: MapTree = {
		type: cursor.type,
		value: cursor.value,
		fields,
	};

	return node;
}
