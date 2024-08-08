/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	mapCursorField,
	mapCursorFields,
} from "../../core/index.js";
import {
	type CursorAdapter,
	stackTreeNodeCursor,
	TreeNodeSchemaBase,
} from "../../feature-libraries/index.js";
import { brand, isReadonlyArray, type JsonCompatible } from "../../util/index.js";
import { leaf } from "../leafDomain.js";

import { jsonArray, jsonObject } from "./jsonDomainSchema.js";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces/internal";

const adapter: CursorAdapter<JsonCompatible> = {
	value: (node: JsonCompatible) =>
		node !== null && typeof node === "object"
			? undefined // arrays and objects have no defined value
			: node, // null, boolean, numbers, and strings are their own values
	type: (node: JsonCompatible) => {
		const type = typeof node;

		switch (type) {
			case "number":
				return leaf.number.name;
			case "string":
				return leaf.string.name;
			case "boolean":
				return leaf.boolean.name;
			default:
				if (node === null) {
					return leaf.null.name;
				} else if (isReadonlyArray(node)) {
					return jsonArray.name;
				} else {
					return jsonObject.name;
				}
		}
	},
	keysFromNode: (node: JsonCompatible): readonly FieldKey[] => {
		switch (typeof node) {
			case "object":
				if (node === null) {
					return [];
				} else if (isReadonlyArray(node)) {
					return node.length === 0 ? [] : [EmptyKey];
				} else {
					return Object.keys(node) as FieldKey[];
				}
			default:
				return [];
		}
	},
	getFieldFromNode: (node: JsonCompatible, key: FieldKey): readonly JsonCompatible[] => {
		// Object.prototype.hasOwnProperty can return true for strings (ex: with key "0"), so we have to filter them out.
		// Rather than just special casing strings, we can handle them with an early return for all primitives.
		if (typeof node !== "object") {
			return [];
		}

		if (node === null) {
			return [];
		}

		if (isReadonlyArray(node)) {
			return key === EmptyKey ? node : [];
		}

		if (Object.prototype.hasOwnProperty.call(node, key)) {
			const field = node[key];
			assert(
				field !== undefined,
				0x41e /* explicit undefined fields should not be preserved in JSON */,
			);
			return [field];
		}

		return [];
	},
};

/**
 * Used to read generic json compatible data as a tree in the JSON domain.
 * The returned tree will have a schema in the json domain as defined by {@link jsonRoot}.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single {@link JsonCompatible}.
 */
export function singleJsonCursor(root: JsonCompatible): ITreeCursorSynchronous {
	return stackTreeNodeCursor(adapter, root);
}

/**
 * Extract a JS object tree from the contents of the given ITreeCursor.
 * Assumes that ITreeCursor contains only unaugmented JsonTypes.
 */
export function cursorToJsonObject(reader: ITreeCursor): JsonCompatible {
	const type = reader.type;

	switch (type) {
		case leaf.number.name:
		case leaf.boolean.name:
		case leaf.string.name:
			assert(reader.value !== undefined, 0x84f /* out of schema: missing value */);
			assert(!isFluidHandle(reader.value), 0x850 /* out of schema: unexpected FluidHandle */);
			return reader.value;
		case jsonArray.name: {
			reader.enterField(EmptyKey);
			const result = mapCursorField(reader, cursorToJsonObject);
			reader.exitField();
			return result;
		}
		case jsonObject.name: {
			const result: JsonCompatible = {};
			mapCursorFields(reader, (cursor) => {
				const key = cursor.getFieldKey();
				assert(cursor.firstNode(), 0x420 /* expected non-empty field */);
				// like `result[key] = cursorToJsonObject(reader);` except safe when keyString == "__proto__".
				Object.defineProperty(result, key, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: cursorToJsonObject(reader),
				});
				assert(!cursor.nextNode(), 0x421 /* expected exactly one node */);
			});
			return result;
		}
		default: {
			assert(type === leaf.null.name, 0x422 /* unexpected type */);
			return null;
		}
	}
}

// #region TypedJsonCursor

/** Used to construct a {@link TypedJsonCursor} */
export interface TypedJsonCompatibleObject {
	[key: string]: TypedJsonCompatible;
	[typedJsonSymbol]: string | TreeNodeSchemaBase;
}

/** Used to construct a {@link TypedJsonCursor} */
export type TypedJsonCompatible =
	| JsonCompatible
	| TypedJsonCompatibleObject
	| TypedJsonCompatible[]
	| IFluidHandle
	| JsonCompatible;

const typedJsonSymbol = Symbol("JSON Cursor Type");

function isObject(json: TypedJsonCompatible): json is TypedJsonCompatibleObject {
	if (typeof json === "object" && json !== null) {
		const typed = json as Partial<TypedJsonCompatibleObject>;
		return typed[typedJsonSymbol] !== undefined;
	}

	return false;
}

const typedAdapter: CursorAdapter<TypedJsonCompatible> = {
	value: (node: TypedJsonCompatible) => {
		if (isFluidHandle(node)) {
			return node;
		}

		// TODO: Get rid of this cast by combining TypedJsonCompatible and JsonCompatible into a single cursor with flags to configure behavior.
		// This cast is necessary because TypedJsonCompatible can have Fluid handles underneath it, however, `adapter` only cares if `node` itself is a FluidHandle, which it is not.
		return adapter.value(node as JsonCompatible);
	},
	type: (node: TypedJsonCompatible) => {
		if (isFluidHandle(node)) {
			return leaf.handle.name;
		}

		if (isObject(node)) {
			const type = node[typedJsonSymbol];
			return type instanceof TreeNodeSchemaBase ? type.name : brand(type);
		}

		return adapter.type(node as JsonCompatible);
	},
	keysFromNode: (node: TypedJsonCompatible): readonly FieldKey[] => {
		if (isFluidHandle(node)) {
			return [];
		}
		return adapter.keysFromNode(node as JsonCompatible);
	},
	getFieldFromNode: (
		node: TypedJsonCompatible,
		key: FieldKey,
	): readonly TypedJsonCompatible[] => {
		if (isFluidHandle(node)) {
			return [];
		}

		const field = adapter.getFieldFromNode(node as JsonCompatible, key);
		if (isReadonlyArray(field) && field.length === 1 && isReadonlyArray(field[0])) {
			// If the field is an array wrapping another array, then unbox to the inner array
			return field[0];
		}

		return field;
	},
};

/**
 * A variant of {@link singleJsonCursor} which allows types to be provided for nodes.
 *
 * @remarks Types are optional, but if present will be used to derive the type of the node when the cursor is read.
 *
 * This cursor differs from singleJsonCursor in that it inlines arrays, (arrays are not boxed into an "array node" but are directly interpreted as sequence fields).
 *
 * It also allows Fluid handles as input.
 *
 * @example
 * ```ts
 * const cursor = typedJsonCursor({
 *   [typedJsonCursor.type]: Point,
 *   x: 3,
 *   y: 42
 * });
 * ```
 */
const singleTypedJsonCursor = function (root: TypedJsonCompatible): ITreeCursorSynchronous {
	return stackTreeNodeCursor(typedAdapter, root);
};

singleTypedJsonCursor.type = typedJsonSymbol;

export { singleTypedJsonCursor as typedJsonCursor };

// #endregion TypedJsonCursor
