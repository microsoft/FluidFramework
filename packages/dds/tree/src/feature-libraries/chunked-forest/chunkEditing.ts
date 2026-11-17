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
 * A {@link TreeChunk} that supports navigation and optional edits without changing its representation.
 */
export interface EditableChunk extends TreeChunk {
	/**
	 * Creates an independently mutable copy with one owned reference.
	 */
	clone(): EditableChunk;
	/**
	 * Creates a {@link ChunkEditCursor} in the chunk's root field.
	 * @remarks
	 * The caller must exclusively own the chunk while using the cursor.
	 * The adapter can expose child arrays through {@link ChunkEditCursor.getFieldChunks},
	 * support format-specific splices through {@link ChunkEditCursor.trySplice}, or both.
	 */
	getEditCursor(): ChunkEditCursor;
}

/**
 * A {@link ChunkLocalCursor} with format-specific editing support for an exclusively owned chunk.
 * @remarks
 * The shared editing layer handles generic splices to exposed child arrays and normalization of unsupported inline edits.
 * An adapter must supply {@link ChunkEditCursor.getFieldChunks}, {@link ChunkEditCursor.trySplice}, or both.
 */
export interface ChunkEditCursor extends ChunkLocalCursor {
	/**
	 * Returns the current field's mutable child chunk array, or undefined when no such array is exposed.
	 * @remarks
	 * The caller must make a child chunk exclusive before entering it for editing.
	 * Requires fields mode. A sequence chunk exposes its root array; a node chunk's synthetic root has no child array.
	 * Navigation into an exposed array belongs to the shared traversal, not this local cursor.
	 * Entirely inline storage omits this hook and supplies {@link ChunkEditCursor.trySplice}, preserving specialized inline navigation.
	 */
	getFieldChunks?(): TreeChunk[] | undefined;
	/**
	 * Finalizes an edit to the child array returned by {@link ChunkEditCursor.getFieldChunks}.
	 * @remarks
	 * Required when the adapter exposes a child array; omitted for entirely inline storage.
	 * Registers arrays for newly created fields and removes empty fields when required by the format.
	 * The caller has already updated the array and its counted references; this method must not change reference counts.
	 * Requires an exclusively owned field and leaves the adapter at that field.
	 * Edits to a chunk's root sequence must preserve {@link ChunkLocalCursor.rootLength}.
	 * @param chunks - The exposed array after editing, including an array returned for a previously absent field.
	 */
	setFieldChunks?(chunks: TreeChunk[]): void;
	/**
	 * Optionally replaces `range` using format-specific storage operations and returns the outgoing chunks.
	 * @remarks
	 * Requires the chunk's root sequence or a field owned by that chunk, and exclusive ownership of the chunk.
	 * Editing a separately stored child requires {@link EditableChunk.getEditCursor} for that child.
	 * Invalid edit locations and ranges are errors, not unsupported edits.
	 * On success, consumes the owned references in `content` and returns owned references to outgoing content.
	 * Does not modify the `content` array itself.
	 * Returns undefined for an unsupported edit without changing content or reference counts.
	 * If omitted or declined, the shared editing layer can splice an exposed child array or normalize inline storage.
	 * The cursor remains in the current field.
	 * @param compressor - {@link ChunkCompressor} used when the format requires chunking or ID compression.
	 */
	trySplice?(
		range: Range,
		content: readonly TreeChunk[],
		compressor: ChunkCompressor,
	): TreeChunk[] | undefined;
}

/**
 * Checks whether a {@link TreeChunk} provides the {@link EditableChunk} contract.
 */
export function isEditableChunk(chunk: TreeChunk): chunk is EditableChunk {
	return "getEditCursor" in chunk;
}

/**
 * Returns the sum of {@link TreeChunk.topLevelLength} over a chunk sequence.
 * @remarks
 * Scans the array on each call; the result is not cached.
 */
export function getFieldLength(chunks: readonly TreeChunk[]): number {
	return chunks.reduce((length, chunk) => length + chunk.topLevelLength, 0);
}

/**
 * Locates a top-level node within a field represented by {@link TreeChunk}s.
 * @param chunks - Borrowed chunk array representing the whole field.
 * @param index - Non-negative safe integer indexing the nodes across all chunks in the field.
 * Must be less than {@link getFieldLength} of `chunks`.
 * @returns The containing chunk, its index in `chunks`, and the node's index among that chunk's top-level nodes.
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
