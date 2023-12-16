/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldUpPath,
	ITreeCursorSynchronous,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
} from "../../../core";
import { leaf } from "../../../domains";
import { jsonableTreeFromCursor, TreeChunk } from "../../../feature-libraries";
import { checkFieldTraversal } from "../../cursorTestSuite";

export function jsonableTreesFromFieldCursor(cursor: ITreeCursorSynchronous): JsonableTree[] {
	return mapCursorField(cursor, jsonableTreeFromCursor);
}

export function numberSequenceField(length: number): JsonableTree[] {
	const field: JsonableTree[] = [];
	for (let index = 0; index < length; index++) {
		field.push({ type: leaf.number.name, value: index });
	}
	return field;
}

export function assertChunkCursorEquals(chunk: TreeChunk, expected: JsonableTree[]): void {
	const result = jsonableTreesFromFieldCursor(chunk.cursor());
	assert.deepEqual(result, expected);
	assert.equal(chunk.topLevelLength, expected.length);
}

export function assertChunkCursorBatchEquals(chunk: TreeChunk[], expected: JsonableTree[][]): void {
	assert.equal(chunk.length, expected.length);
	for (let index = 0; index < chunk.length; index++) {
		assertChunkCursorEquals(chunk[index], expected[index]);
	}
}

export function validateChunkCursor(
	chunk: TreeChunk,
	expected: JsonableTree[],
	expectedPath: FieldUpPath = {
		field: rootFieldKey,
		parent: undefined,
	},
): void {
	checkFieldTraversal(chunk.cursor(), expectedPath);
	assertChunkCursorEquals(chunk, expected);
}
