/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	EmptyKey,
	FieldUpPath,
	ITreeCursorSynchronous,
	JsonableTree,
	mapCursorField,
	rootFieldKeySymbol,
} from "../../../core";
import { jsonArray, jsonNumber } from "../../../domains";
import { jsonableTreeFromCursor, singleTextCursor, TreeChunk } from "../../../feature-libraries";
import { checkFieldTraversal } from "../../cursorTestSuite";

/**
 * Note that returned cursor is not at the root of its tree, so its path may be unexpected.
 * It is placed under index 0 of the EmptyKey field.
 */
export function fieldCursorFromJsonableTrees(trees: JsonableTree[]): ITreeCursorSynchronous {
	const fullTree: JsonableTree = { type: jsonArray.name, fields: { [EmptyKey]: trees } };
	const cursor = singleTextCursor(fullTree);
	cursor.enterField(EmptyKey);
	return cursor;
}

export function jsonableTreesFromFieldCursor(cursor: ITreeCursorSynchronous): JsonableTree[] {
	return mapCursorField(cursor, jsonableTreeFromCursor);
}

export function numberSequenceField(length: number): JsonableTree[] {
	const field: JsonableTree[] = [];
	for (let index = 0; index < length; index++) {
		field.push({ type: jsonNumber.name, value: index });
	}
	return field;
}

export function assertChunkCursorEquals(chunk: TreeChunk, expected: JsonableTree[]): void {
	const result = jsonableTreesFromFieldCursor(chunk.cursor());
	assert.deepEqual(result, expected);
	assert.equal(chunk.topLevelLength, expected.length);
}

export function validateChunkCursor(
	chunk: TreeChunk,
	expected: JsonableTree[],
	expectedPath: FieldUpPath = {
		field: rootFieldKeySymbol,
		parent: undefined,
	},
): void {
	checkFieldTraversal(chunk.cursor(), expectedPath);
	assertChunkCursorEquals(chunk, expected);
}
