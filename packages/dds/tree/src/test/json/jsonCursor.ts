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
	keyAsDetachedField,
	mapCursorField,
	mapCursorFields,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import {
	type CursorAdapter,
	stackTreeFieldCursor,
	stackTreeNodeCursor,
} from "../../feature-libraries/index.js";
import { brand, isReadonlyArray, type JsonCompatible } from "../../util/index.js";

import { JsonArray, JsonObject } from "../../jsonDomainSchema.js";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import {
	booleanSchema,
	nullSchema,
	numberSchema,
	stringSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/leafNodeSchema.js";

const adapter: CursorAdapter<JsonCompatible> = {
	value: (node: JsonCompatible) =>
		node !== null && typeof node === "object"
			? undefined // arrays and objects have no defined value
			: node, // null, boolean, numbers, and strings are their own values
	type: (node: JsonCompatible): TreeNodeSchemaIdentifier => {
		const type = typeof node;

		switch (type) {
			case "number":
				return brand(numberSchema.identifier);
			case "string":
				return brand(stringSchema.identifier);
			case "boolean":
				return brand(booleanSchema.identifier);
			default:
				if (node === null) {
					return brand(nullSchema.identifier);
				} else if (isReadonlyArray(node)) {
					return brand(JsonArray.identifier);
				} else {
					return brand(JsonObject.identifier);
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
 * Used to read generic json compatible data as a tree in the JSON domain.
 * The returned tree will have a schema in the json domain as defined by {@link jsonRoot}.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single {@link JsonCompatible}.
 */
export function fieldJsonCursor(root: JsonCompatible[]): ITreeCursorSynchronous {
	return stackTreeFieldCursor(adapter, root, keyAsDetachedField(EmptyKey));
}

/**
 * Extract a JS object tree from the contents of the given ITreeCursor.
 * Assumes that ITreeCursor contains only unaugmented JsonTypes.
 */
export function cursorToJsonObject(reader: ITreeCursor): JsonCompatible {
	const type = reader.type;

	switch (type) {
		case numberSchema.identifier:
		case booleanSchema.identifier:
		case stringSchema.identifier:
			assert(reader.value !== undefined, 0x84f /* out of schema: missing value */);
			assert(!isFluidHandle(reader.value), 0x850 /* out of schema: unexpected FluidHandle */);
			return reader.value;
		case JsonArray.identifier: {
			reader.enterField(EmptyKey);
			const result = mapCursorField(reader, cursorToJsonObject);
			reader.exitField();
			return result;
		}
		case JsonObject.identifier: {
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
			assert(type === nullSchema.identifier, 0x422 /* unexpected type */);
			return null;
		}
	}
}
