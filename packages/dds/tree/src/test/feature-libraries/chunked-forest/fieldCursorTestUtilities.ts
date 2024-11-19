/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type FieldUpPath,
	type ITreeCursorSynchronous,
	type JsonableTree,
	mapCursorField,
	rootFieldKey,
} from "../../../core/index.js";
import { type TreeChunk, jsonableTreeFromCursor } from "../../../feature-libraries/index.js";
import { checkFieldTraversal } from "../../cursorTestSuite.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";

export function jsonableTreesFromFieldCursor(cursor: ITreeCursorSynchronous): JsonableTree[] {
	return mapCursorField(cursor, jsonableTreeFromCursor);
}

export function numberSequenceField(length: number): JsonableTree[] {
	const field: JsonableTree[] = [];
	for (let index = 0; index < length; index++) {
		field.push({ type: brand(numberSchema.identifier), value: index });
	}
	return field;
}

export function assertChunkCursorEquals(chunk: TreeChunk, expected: JsonableTree[]): void {
	const result = jsonableTreesFromFieldCursor(chunk.cursor());
	assert.deepEqual(result, expected);
	assert.equal(chunk.topLevelLength, expected.length);
}

export function assertChunkCursorBatchEquals(
	chunk: TreeChunk[],
	expected: JsonableTree[][],
): void {
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
