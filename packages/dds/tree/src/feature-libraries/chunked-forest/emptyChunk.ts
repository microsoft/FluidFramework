/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CursorLocationType,
	CursorMarker,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type UpPath,
	type ChunkedCursor,
	type TreeChunk,
	cursorChunk,
	dummyRoot,
} from "../../core/index.js";
import { fail } from "../../util/index.js";
import { prefixFieldPath } from "../treeCursorUtils.js";

/**
 * Chunk that is empty.
 *
 * Since all emptiness is the same, this is a singleton.
 *
 * Useful for when a chunk or cursor is needed for an empty field or detached sequence.
 */
export const emptyChunk: TreeChunk = {
	topLevelLength: 0,
	cursor(): ChunkedCursor {
		return emptyCursor;
	},
	referenceAdded(): void {},
	referenceRemoved(): void {},
	isShared(): boolean {
		return false; // Immutable, so sharing does not matter.
	},
};

const emptyPath: FieldUpPath = {
	parent: undefined,
	field: dummyRoot,
};

/**
 * Cursor over an empty field.
 * Contains no nodes and is stateless.
 */
export const emptyCursor: ChunkedCursor = {
	[CursorMarker]: true,
	pending: false,
	mode: CursorLocationType.Fields,
	[cursorChunk]: emptyChunk,
	nextField(): boolean {
		fail("cannot navigate above root");
	},
	exitField(): void {
		fail("cannot navigate above root");
	},
	skipPendingFields(): boolean {
		return true;
	},
	getFieldKey(): FieldKey {
		return emptyPath.field;
	},
	getFieldLength(): number {
		return 0;
	},
	firstNode(): boolean {
		return false;
	},
	enterNode(childIndex: number): void {
		fail("empty cursor has no nodes");
	},
	getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return prefixFieldPath(prefix, emptyPath);
	},
	getPath(): UpPath | undefined {
		fail("empty cursor has no nodes");
	},
	get fieldIndex(): never {
		return fail("empty cursor has no nodes");
	},
	get chunkStart(): never {
		return fail("empty cursor has no nodes");
	},
	get chunkLength(): never {
		return fail("empty cursor has no nodes");
	},
	seekNodes(offset: number): boolean {
		fail("empty cursor has no nodes");
	},
	nextNode(): boolean {
		fail("empty cursor has no nodes");
	},
	exitNode(): void {
		fail("empty cursor has no nodes");
	},
	firstField(): boolean {
		fail("empty cursor has no nodes");
	},
	enterField(key: FieldKey): void {
		fail("empty cursor has no nodes");
	},
	get type(): never {
		return fail("empty cursor has no nodes");
	},
	get value(): never {
		return fail("empty cursor has no nodes");
	},
	atChunkRoot(): boolean {
		return true;
	},
	fork(): ChunkedCursor {
		return emptyCursor;
	},
};
