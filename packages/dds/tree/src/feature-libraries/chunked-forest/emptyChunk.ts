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
		fail(0xafb /* cannot navigate above root */);
	},
	exitField(): void {
		fail(0xafc /* cannot navigate above root */);
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
		fail(0xafd /* empty cursor has no nodes */);
	},
	getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return prefixFieldPath(prefix, emptyPath);
	},
	getPath(): UpPath | undefined {
		fail(0xafe /* empty cursor has no nodes */);
	},
	get fieldIndex(): never {
		return fail(0xaff /* empty cursor has no nodes */);
	},
	get chunkStart(): never {
		return fail(0xb00 /* empty cursor has no nodes */);
	},
	get chunkLength(): never {
		return fail(0xb01 /* empty cursor has no nodes */);
	},
	seekNodes(offset: number): boolean {
		fail(0xb02 /* empty cursor has no nodes */);
	},
	nextNode(): boolean {
		fail(0xb03 /* empty cursor has no nodes */);
	},
	exitNode(): void {
		fail(0xb04 /* empty cursor has no nodes */);
	},
	firstField(): boolean {
		fail(0xb05 /* empty cursor has no nodes */);
	},
	enterField(key: FieldKey): void {
		fail(0xb06 /* empty cursor has no nodes */);
	},
	get type(): never {
		return fail(0xb07 /* empty cursor has no nodes */);
	},
	get value(): never {
		return fail(0xb08 /* empty cursor has no nodes */);
	},
	atChunkRoot(): boolean {
		return true;
	},
	fork(): ChunkedCursor {
		return emptyCursor;
	},
};
