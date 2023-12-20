/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	ITreeCursor,
	EmptyKey,
	FieldKey,
	mapCursorField,
	mapCursorFields,
	ITreeCursorSynchronous,
} from "../../core";
import { JsonCompatible } from "../../util";
import { CursorAdapter, isFluidHandle, stackTreeNodeCursor } from "../../feature-libraries";
import { leaf } from "../leafDomain";
import { jsonArray, jsonObject } from "./jsonDomainSchema";

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
				} else if (Array.isArray(node)) {
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
				} else if (Array.isArray(node)) {
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

		if (Array.isArray(node)) {
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
 * Used to read a Jsonable tree for testing and benchmarking.
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
