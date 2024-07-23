/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ITreeCursorSynchronous,
	forEachField,
	forEachNode,
} from "../../../core/index.js";
import type { FluidSerializableReadOnly } from "../../valueUtilities.js";

import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedFieldBatch,
	type EncodedNestedArray,
	type EncodedTreeShape,
	version,
} from "./format.js";
import type { ShapeIndex } from "./formatGeneric.js";

/**
 * Encode data from `cursor` in the simplest way supported by `EncodedChunk`.
 *
 * No polymorphism, identifier deduplication or schema based compression.
 * Just uses two hard coded shapes and inline identifiers.
 *
 * This is intended as a simple reference implementation with minimal code and dependencies.
 */
export function uncompressedEncode(batch: FieldBatch): EncodedFieldBatch {
	const rootFields = batch.map(encodeSequence);
	return {
		version,
		identifiers: [],
		// A single shape used to encode all fields.
		shapes: [{ c: anyTreeShape }, { a: anyArray }],
		// Wrap up each field as an indicator to use the above shape, and its encoded data.
		data: rootFields.map((data) => [arrayIndex, data]),
	};
}

const treeIndex: ShapeIndex = 0;
const arrayIndex: ShapeIndex = 1;

const anyTreeShape: EncodedTreeShape = {
	extraFields: arrayIndex,
};

const anyArray: EncodedNestedArray = treeIndex;

/**
 * Encode a field using the hard coded shape above.
 * @remarks
 * Since this shape contains no information about the actual schema, all schema/shape information is inline in the data:
 * that is why this encoding is called "uncompressed".
 */
function encodeSequence(cursor: ITreeCursorSynchronous): FluidSerializableReadOnly[] {
	const data: FluidSerializableReadOnly[] = [];
	forEachNode(cursor, () => {
		data.push(cursor.type);
		const value = cursor.value;
		data.push(value !== undefined);
		if (value !== undefined) {
			data.push(value);
		}
		const local: FluidSerializableReadOnly[] = [];
		forEachField(cursor, () => {
			const key = cursor.getFieldKey();
			local.push(key, encodeSequence(cursor));
		});
		data.push(local);
	});
	return data;
}
