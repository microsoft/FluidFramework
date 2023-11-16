/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	FieldKey,
	MapTree,
	ITreeCursor,
	CursorLocationType,
	mapCursorField,
	DetachedField,
	detachedFieldAsKey,
	rootField,
	aboveRootPlaceholder,
} from "../core";
import {
	CursorAdapter,
	CursorWithNode,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "./treeCursorUtils";

/**
 * @param root - The tree with which the cursor will be associated.
 * @param mode - The mode the cursor should be initialized in.
 * @returns An {@link ITreeCursorSynchronous} in nodes mode for a single {@link MapTree}.
 */
export function cursorForMapTreeNode(
	root: MapTree,
	mode: CursorLocationType = CursorLocationType.Nodes,
): CursorWithNode<MapTree> {
	switch (mode) {
		case CursorLocationType.Nodes:
			return stackTreeNodeCursor(adapter, root);
		case CursorLocationType.Fields:
			return stackTreeFieldCursor(adapter, root);
		default:
			unreachableCase(mode);
	}
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
