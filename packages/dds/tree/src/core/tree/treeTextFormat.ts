/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { NodeData } from "./types.js";

/**
 * This modules provides a simple human readable (and editable) tree format.
 *
 * This implementation can handle all trees (so it does not need a fallback for any special cases),
 * and is not optimized.
 *
 * It's suitable for testing and debugging,
 * though it could also reasonably be used as a fallback for edge cases or for small trees.
 *
 * The serialized format is valid utf-8, and also includes a json compatible intermediate in memory format.
 *
 * This format is currently not stable: its internal contents are not considered public APIs and may change.
 * There is currently no guarantee that data serialized with this library will
 * be loadable with a different version of this library.
 *
 * TODO: stabilize this format (probably after schema are more stable).
 *
 * This format does not include schema: typically schema would be stored alongside data in this format.
 *
 * @privateRemarks A forked version of these types is available at `persistedTreeTextFormat.ts`.
 * Changes to them might necessitate changes to the analogous forked types, or codecs which transcode between
 * them.
 * See persistedTreeTextFormat's module documentation for more details.
 */

/**
 * Json compatible map as object.
 * Keys are FieldKey strings.
 * Values are the content of the field specified by the key.
 *
 * WARNING:
 * Be very careful when using objects as maps:
 * Use `Object.prototype.hasOwnProperty.call(fieldMap, key)` to safely check for keys.
 * Do NOT simply read the field and check for undefined as this will return values for `__proto__`
 * and various methods on Object.prototype, like `hasOwnProperty` and `toString`.
 * This exposes numerous bug possibilities, including prototype pollution.
 *
 * Due to the above issue, try to avoid this type (and the whole object as map pattern).
 * Only use this type when needed for json compatible maps,
 * but even in those cases consider lists of key value pairs for serialization and using `Map`
 * for runtime.
 */
export interface FieldMapObject<TChild> {
	[key: string]: TChild[];
}

/**
 * Json comparable tree node, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
export interface GenericTreeNode<TChild> extends GenericFieldsNode<TChild>, NodeData {}

/**
 * Json comparable field collection, generic over child type.
 * Json compatibility assumes `TChild` is also json compatible.
 */
export interface GenericFieldsNode<TChild> {
	fields?: FieldMapObject<TChild>;
}

/**
 * A tree represented using plain JavaScript objects.
 * Can be passed to `JSON.stringify()` to produce a human-readable/editable JSON tree.
 * If the tree may contain an {@link @fluidframework/core-interfaces#IFluidHandle},
 * {@link @fluidframework/shared-object-base#IFluidSerializer.stringify} must be used instead of `JSON.stringify`.
 *
 * JsonableTrees should not store empty fields.
 */
export interface JsonableTree extends GenericTreeNode<JsonableTree> {}

/**
 * Get a field from `node`, optionally modifying the tree to create it if missing.
 */
export function getGenericTreeField<T>(
	node: GenericFieldsNode<T>,
	key: FieldKey,
	createIfMissing: boolean,
): T[] {
	const children = getGenericTreeFieldMap(node, createIfMissing);

	// Do not just read field and check for undefined: see warning on FieldMapObject.
	if (Object.prototype.hasOwnProperty.call(children, key)) {
		return children[key] ?? fail(0xaed /* This wont be undefined due to the check above */);
	}
	// Handle missing field:
	if (createIfMissing === false) {
		return [];
	}
	const newField: T[] = [];
	children[key] = newField;
	return newField;
}

/**
 * Get a FieldMap from `node`, optionally modifying the tree to create it if missing.
 */
function getGenericTreeFieldMap<T>(
	node: GenericFieldsNode<T>,
	createIfMissing: boolean,
): FieldMapObject<T> {
	let children = node.fields;
	if (children === undefined) {
		children = {};
		// Handle missing fields:
		if (createIfMissing) {
			node.fields = children;
		}
	}

	return children;
}

/**
 * Sets a field on `node`.
 */
export function setGenericTreeField<T>(
	node: GenericFieldsNode<T>,
	key: FieldKey,
	content: T[],
): void {
	const children = getGenericTreeFieldMap(node, true);
	// like `children[keyString] = content;` except safe when keyString == "__proto__".
	Object.defineProperty(children, key, {
		enumerable: true,
		configurable: true,
		writable: true,
		value: content,
	});
}

/**
 * @returns keys for fields of `tree`.
 */
export function genericTreeKeys<T>(tree: GenericFieldsNode<T>): readonly FieldKey[] {
	const fields = tree.fields;
	// This function is used when iterating through a tree.
	// This means that this is often called on nodes with no keys
	// (most trees are a large portion leaf nodes).
	// Therefore this function special cases empty fields objects as an optimization.
	if (fields === undefined) {
		return [];
	}

	return Object.keys(fields) as FieldKey[];
}

/**
 * Delete a field if empty.
 * Optionally delete FieldMapObject if empty as well.
 */
export function genericTreeDeleteIfEmpty<T>(
	node: GenericFieldsNode<T>,
	key: FieldKey,
	removeMapObject: boolean,
): void {
	const children = getGenericTreeFieldMap(node, false);
	if (Object.prototype.hasOwnProperty.call(children, key)) {
		if (children[key]?.length === 0) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete children[key];
			if (removeMapObject) {
				if (Object.keys(children).length === 0) {
					delete node.fields;
				}
			}
		}
	}
}
