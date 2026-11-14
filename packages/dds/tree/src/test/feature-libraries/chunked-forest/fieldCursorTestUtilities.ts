/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ChunkedCursor,
	type FieldUpPath,
	type JsonableTree,
	rootFieldKey,
} from "../../../core/index.js";
import {
	jsonableTreeFromFieldCursor,
	type TreeChunk,
} from "../../../feature-libraries/index.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { ReferenceCountedBase, brand } from "../../../util/index.js";
import { checkFieldTraversal } from "../../cursorTestSuite.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";

export function numberSequenceField(length: number): JsonableTree[] {
	const field: JsonableTree[] = [];
	for (let index = 0; index < length; index++) {
		field.push({ type: brand(numberSchema.identifier), value: index });
	}
	return field;
}

export function assertChunkCursorEquals(chunk: TreeChunk, expected: JsonableTree[]): void {
	const result = jsonableTreeFromFieldCursor(chunk.cursor());
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
	expectedPath?: FieldUpPath,
): void {
	const path = expectedPath ?? { field: rootFieldKey, parent: undefined };
	checkFieldTraversal(chunk.cursor(), path);
	assertChunkCursorEquals(chunk, expected);
}

/** Creates a numeric BasicChunk with one owned reference. */
export function numericBasicChunk(value: number = 0): BasicChunk {
	return new BasicChunk(brand(numberSchema.identifier), new Map(), value);
}

/**
 * Wraps a chunk without exposing its concrete type or optional editing interface.
 * Adds and owns one reference to the wrapped chunk, exercising generic cursor fallback paths.
 */
export class WrapperChunk extends ReferenceCountedBase implements TreeChunk {
	public constructor(
		/** Wrapped storage, retained by one reference owned by this wrapper. */
		public readonly chunk: TreeChunk,
	) {
		super();
		chunk.referenceAdded();
	}

	protected onUnreferenced(): void {
		this.chunk.referenceRemoved();
	}

	public get topLevelLength(): number {
		return this.chunk.topLevelLength;
	}

	public cursor(): ChunkedCursor {
		return this.chunk.cursor();
	}
}
