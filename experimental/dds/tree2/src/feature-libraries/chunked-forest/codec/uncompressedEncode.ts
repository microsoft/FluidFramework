/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITreeCursorSynchronous,
	TreeValue,
	forEachField,
	forEachNode,
	isGlobalFieldKey,
	keyFromSymbol,
} from "../../../core";
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
	extraGlobal: arrayIndex,
	extraLocal: arrayIndex,
	local: [],
	global: [],
};

const anyArray: EncodedNestedArray = treeIndex;

function encodeSequence(cursor: ITreeCursorSynchronous): TreeValue[] {
	const data: TreeValue[] = [];
	forEachNode(cursor, () => {
		data.push(cursor.type);
		const value = cursor.value;
		data.push(value !== undefined);
		if (value !== undefined) {
			data.push(value);
		}
		const local: TreeValue[] = [];
		const global: TreeValue[] = [];
		forEachField(cursor, () => {
			const key = cursor.getFieldKey();
			let output: TreeValue[];
			let keyString: string;
			if (isGlobalFieldKey(key)) {
				output = global;
				keyString = keyFromSymbol(key);
			} else {
				output = local;
				keyString = key;
			}
			output.push(keyString, encodeSequence(cursor));
		});
		data.push(local, global);
	});
	return data;
}
