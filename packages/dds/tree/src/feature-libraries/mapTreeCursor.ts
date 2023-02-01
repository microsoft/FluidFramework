/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldKey, MapTree, ITreeCursor, CursorLocationType, mapCursorField } from "../core";
import { CursorAdapter, CursorWithNode, singleStackTreeCursor } from "./treeCursorUtils";

/**
 * @returns an ITreeCursorSynchronous for a single MapTree.
 */
export function singleMapTreeCursor(root: MapTree): CursorWithNode<MapTree> {
	return singleStackTreeCursor(root, adapter);
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
