/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous, forEachField, forEachNode } from "../../../core";
import { FluidSerializableReadOnly } from "../../contextuallyTyped";
import { EncodedChunk, version, EncodedTreeShape, EncodedNestedArray } from "./format";
import { ShapeIndex } from "./formatGeneric";

/**
 * Encode data from `cursor` in the simplest way supported by `EncodedChunk`.
 *
 * No polymorphism, identifier deduplication or schema based compression.
 * Just uses two hard coded shapes and inline identifiers.
 *
 * This is intended as a simple reference implementation with minimal code and dependencies.
 */
export function uncompressedEncode(cursor: ITreeCursorSynchronous): EncodedChunk {
	const rootField = encodeSequence(cursor);
	return {
		version,
		identifiers: [],
		shapes: [{ c: anyTreeShape }, { a: anyArray }],
		data: [arrayIndex, rootField],
	};
}

const treeIndex: ShapeIndex = 0;
const arrayIndex: ShapeIndex = 1;

const anyTreeShape: EncodedTreeShape = {
	extraFields: arrayIndex,
	fields: [],
};

const anyArray: EncodedNestedArray = treeIndex;

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
