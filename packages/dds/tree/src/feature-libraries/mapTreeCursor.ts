/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	type DetachedField,
	type ExclusiveMapTree,
	type FieldKey,
	type ITreeCursor,
	type MapTree,
	type NodeData,
	aboveRootPlaceholder,
	detachedFieldAsKey,
	mapCursorField,
	rootField,
	rootFieldKey,
} from "../core/index.js";

import {
	type CursorAdapter,
	type CursorWithNode,
	type Field,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "./treeCursorUtils.js";
import type { requireAssignableTo } from "../util/index.js";

/**
 * A generic variant of {@link MapTree} that can be used to strongly type trees implementing a MapTree-like API.
 * @remarks
 * Due to how TypeScript handles recursive generic types, explicitly named extension interfaces work best for parameterizing this, and a default type parameter can't be provided.
 * @see {@link MinimalMapTreeNodeView} for a minimal configuration of this interface.
 */
export interface MapTreeNodeViewGeneric<TNode> extends NodeData {
	/**
	 * The non-empty fields on this node.
	 * @remarks
	 * This is the subset of map needed to view the tree.
	 * Theoretically `Symbol.iterator` and "keys" are redundant.
	 */
	readonly fields: MinimalFieldMap<MapTreeFieldViewGeneric<TNode>>;
}

/**
 * A minimal map for the fields of a {@link MapTreeNodeViewGeneric}.
 * @remarks
 * Subset of map, so can be implemented by `Map<FieldKey, TField>`.
 */
export interface MinimalFieldMap<TField> {
	[Symbol.iterator]: () => Iterator<[FieldKey, TField]>;
	get: (key: FieldKey) => TField | undefined;
}

/**
 * A field in {@link MapTreeNodeViewGeneric}.
 * @remarks
 * Subset of array, so can be implemented by `TNode[]`.
 */
export interface MapTreeFieldViewGeneric<TNode> {
	readonly [Symbol.iterator]: () => Iterator<TNode>;
	readonly length: number;
}

/**
 * Like {@link MapTree} but with the minimal properties needed for reading.
 */
export interface MinimalMapTreeNodeView
	extends MapTreeNodeViewGeneric<MinimalMapTreeNodeView> {}

{
	// Check that these interfaces are subsets of MapTree as intended:
	type _check1 = requireAssignableTo<MapTree, MinimalMapTreeNodeView>;
	type _check2 = requireAssignableTo<MapTree, MapTreeNodeViewGeneric<MapTree>>;
}

/**
 * Returns an {@link ITreeCursorSynchronous} in nodes mode for a single {@link MapTree}.
 */
export function cursorForMapTreeNode<T extends MapTreeNodeViewGeneric<T>>(
	root: T,
): CursorWithNode<T> {
	// There doesn't seem to be a clean way to get TypeScript to type check this without casting
	// without declaring the adapter inside this generic function and needlessly recreating it on every call.
	const adapterTyped = adapter as CursorAdapter<MapTreeNodeViewGeneric<T>> as CursorAdapter<T>;
	return stackTreeNodeCursor(adapterTyped, root);
}

/**
 * Creates an {@link ExclusiveMapTree} with a single field and no value.
 * @remarks
 * This handles ensuring the field is omitted if empty, and defaults to making the node above the root.
 */
export function mapTreeWithField(
	children: ExclusiveMapTree[],
	key = rootFieldKey,
	type = aboveRootPlaceholder,
): ExclusiveMapTree {
	return {
		type,
		fields: mapTreeFieldsWithField(children, key),
	};
}

/**
 * Creates a Map suitable for use as {@link MapTree.fields} with a single field.
 * @remarks
 * This handles ensuring the field is omitted if empty.
 */
export function mapTreeFieldsWithField<T extends readonly unknown[]>(
	children: T,
	key: FieldKey,
): Map<FieldKey, T> {
	return new Map(children.length === 0 ? [] : [[key, children]]);
}

/**
 * Returns an {@link ITreeCursorSynchronous} in fields mode for a MapTree field.
 */
export function cursorForMapTreeField<T extends MapTreeNodeViewGeneric<T>>(
	root: readonly T[],
	detachedField: DetachedField = rootField,
): CursorWithNode<T> {
	const key = detachedFieldAsKey(detachedField);
	const adapterTyped = adapter as unknown as CursorAdapter<T>;
	const dummyRoot: MapTreeNodeViewGeneric<T> = {
		type: aboveRootPlaceholder,
		fields: mapTreeFieldsWithField(root, key),
	};
	return stackTreeFieldCursor(adapterTyped, dummyRoot as T, detachedField);
}

const adapter: CursorAdapter<MinimalMapTreeNodeView> = {
	value: (node) => node.value,
	type: (node) => node.type,
	keysFromNode: (node) => Array.from(node.fields, ([key, field]) => key),
	getFieldFromNode: (node, key): Field<MinimalMapTreeNodeView> => {
		const field = node.fields.get(key) as
			| MinimalMapTreeNodeView[]
			| Iterable<MinimalMapTreeNodeView>
			| undefined;
		if (field === undefined) {
			return [];
		}
		if (Array.isArray(field)) {
			return field as readonly MinimalMapTreeNodeView[];
		}
		// TODO: this copy could be avoided by using Array.at instead of indexing in `Field`, but that requires ES2022.
		return [...field] as readonly MinimalMapTreeNodeView[];
	},
};

/**
 * Extract a MapTree from the contents of the given ITreeCursor's current node.
 */
export function mapTreeFromCursor(cursor: ITreeCursor): ExclusiveMapTree {
	assert(cursor.mode === CursorLocationType.Nodes, 0x3b7 /* must start at node */);
	const fields: Map<FieldKey, ExclusiveMapTree[]> = new Map();
	for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
		const field: ExclusiveMapTree[] = mapCursorField(cursor, mapTreeFromCursor);
		fields.set(cursor.getFieldKey(), field);
	}

	const node: ExclusiveMapTree = {
		type: cursor.type,
		value: cursor.value,
		fields,
	};

	return node;
}

/**
 * Extract an array of MapTrees (a field) from the contents of the given ITreeCursor's current field.
 */
export function mapTreeFieldFromCursor(cursor: ITreeCursor): ExclusiveMapTree[] {
	assert(cursor.mode === CursorLocationType.Fields, 0xa03 /* must start at field */);
	return mapCursorField(cursor, mapTreeFromCursor);
}
