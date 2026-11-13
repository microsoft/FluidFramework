/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import type { Range, TreeChunk } from "../../core/index.js";
import { assertNonNegativeSafeInteger } from "../../util/index.js";

import type { ChunkCompressor } from "./chunkTree.js";
import type { ChunkLocalCursor } from "./chunkCursor.js";

/**
 * A chunk that supports navigation and optional edits without changing its representation.
 */
export interface EditableChunk extends TreeChunk {
	/**
	 * Creates an independently mutable copy with one owned reference.
	 */
	clone(): EditableChunk;
	/**
	 * Creates an editing cursor in the chunk's root field.
	 * The caller must exclusively own the chunk while using the cursor.
	 * The adapter can expose child arrays for generic editing, support format-specific splices, or both.
	 */
	getEditCursor(): ChunkEditCursor;
}

/**
 * Navigation and format-specific editing within an exclusively owned chunk.
 * The shared editing layer handles generic splices to exposed child arrays and normalization of unsupported inline edits.
 */
export interface ChunkEditCursor extends ChunkLocalCursor {
	/**
	 * Returns the current field's mutable child chunk array, or undefined when no such array is exposed.
	 * The caller must make a child chunk exclusive before entering it for editing.
	 * Requires fields mode. A sequence chunk exposes its root array; a node chunk's synthetic root has no child array.
	 * Navigation into an exposed array belongs to the shared traversal, not this local cursor.
	 */
	getFieldChunks(): TreeChunk[] | undefined;
	/**
	 * Finalizes an edit to the child array returned by getFieldChunks.
	 * Required when the adapter exposes a child array; omitted for entirely inline storage.
	 * Registers arrays for newly created fields and removes empty fields when required by the format.
	 * The caller has already updated the array and its counted references; this method must not change reference counts.
	 * Requires an exclusively owned field and leaves the adapter at that field.
	 * Edits to a chunk's root sequence must preserve its top-level node count.
	 * @param chunks - The exposed array after editing, including an array returned for a previously absent field.
	 */
	setFieldChunks?(chunks: TreeChunk[]): void;
	/**
	 * Optionally replaces `range` using format-specific storage operations and returns the outgoing chunks.
	 * @remarks
	 * Requires the chunk's root sequence or a field owned by that chunk, and exclusive ownership of the chunk.
	 * Editing a separately stored child requires obtaining that child's editing cursor.
	 * Invalid edit locations are errors, not unsupported edits.
	 * On success, consumes the owned references in `content` and returns owned references to outgoing content.
	 * Does not modify the `content` array itself.
	 * Returns undefined for an unsupported edit without changing content or reference counts.
	 * If omitted or declined, the shared editing layer can splice an exposed child array or normalize inline storage.
	 * Invalid ranges are errors, not unsupported edits.
	 * The cursor remains in the current field.
	 */
	trySplice?(
		range: Range,
		content: readonly TreeChunk[],
		compressor: ChunkCompressor,
	): TreeChunk[] | undefined;
}

/**
 * Checks whether a chunk provides the optional editing contract.
 */
export function isEditableChunk(chunk: TreeChunk): chunk is EditableChunk {
	return "getEditCursor" in chunk;
}

/**
 * Returns the number of top-level nodes in a chunk sequence.
 */
export function getFieldLength(chunks: readonly TreeChunk[]): number {
	return chunks.reduce((length, chunk) => length + chunk.topLevelLength, 0);
}

/**
 * Locates a node in a chunk sequence by its field index.
 * @param chunks - Borrowed chunks representing the whole field.
 * @param index - Logical node index across all chunks in the field.
 * @returns The containing chunk, its physical index in the array, and the node's top-level offset within that chunk.
 */
export function locateNodeInChunks(
	chunks: readonly TreeChunk[],
	index: number,
): { chunk: TreeChunk; indexOfChunk: number; indexWithinChunk: number } {
	assertNonNegativeSafeInteger(index);
	let indexWithinChunk = index;
	for (let indexOfChunk = 0; indexOfChunk < chunks.length; indexOfChunk++) {
		const chunk = chunks[indexOfChunk] ?? oob();
		if (indexWithinChunk < chunk.topLevelLength) {
			return { chunk, indexOfChunk, indexWithinChunk };
		}
		indexWithinChunk -= chunk.topLevelLength;
	}
	return chunks.length === 0 ? oob() : fail("missing edited node");
}

/**
 * Checks that an edit range is within a field.
 */
export function validateChunkEditRange(range: Range, length: number): void {
	assertNonNegativeSafeInteger(range.start);
	assertNonNegativeSafeInteger(range.end);
	assert(range.start <= range.end, "Edit range start must not exceed end");
	assert(range.end <= length, "Edit range must not exceed field length");
}
