/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import type { Range, TreeChunk } from "../../core/index.js";
import { assertNonNegativeSafeInteger } from "../../util/index.js";

import type { ChunkCompressor } from "./chunkTree.js";
import type { ChunkLocalCursor } from "./chunkCursor.js";
import {
	type ChunkEdit,
	type ChunkSequenceEditor,
	MutableChunk,
	getChunkSequence,
	findChunkIndex,
} from "./chunkSequence.js";

/**
 * A {@link TreeChunk} that supports navigation and optional edits without changing its representation.
 */
export interface EditableChunk extends MutableChunk {
	/**
	 * Whether edits to the root sequence can succeed without replacing this chunk.
	 * @remarks
	 * False lets the shared editing layer skip speculative cloning before replacing the chunk.
	 * Subclasses that add root editing support must override this capability.
	 */
	supportsRootEdits(): boolean;
	/**
	 * Creates an independently mutable copy with one owned reference.
	 */
	clone(): EditableChunk;
	/**
	 * Creates a {@link ChunkEditCursor} in the chunk's root field.
	 * @remarks
	 * Contained chunks require an editor obtained from their owning sequence.
	 * If `edit` is omitted, an external owning reference supplies the editing authority.
	 * The caller must call `release()` on the returned cursor when finished.
	 * This also closes the chunk's edit scope, including a supplied `edit`.
	 * Release the cursor before closing the owning sequence's editor or releasing the external owning reference.
	 * The adapter can expose field editors through {@link ChunkEditCursor.getFieldEditor},
	 * support format-specific splices through {@link ChunkEditCursor.trySplice}, or both.
	 */
	getEditCursor(edit?: ChunkEdit): ChunkEditCursor;
}

/**
 * A {@link ChunkLocalCursor} with format-specific editing support for an exclusively owned chunk.
 * @remarks
 * The shared editing layer handles generic splices to exposed child arrays and normalization of unsupported inline edits.
 * An adapter must supply {@link ChunkEditCursor.getFieldEditor}, {@link ChunkEditCursor.trySplice}, or both.
 */
export interface ChunkEditCursor extends ChunkLocalCursor {
	/**
	 * Borrows the current field's editor, or returns undefined for inline storage.
	 * @remarks
	 * The adapter retains this scope until leaving the field or being released.
	 * Navigation into child chunks belongs to the shared traversal, not this local cursor.
	 * Entirely inline storage omits this hook and supplies {@link ChunkEditCursor.trySplice}, preserving specialized inline navigation.
	 */
	getFieldEditor?(): ChunkSequenceEditor | undefined;
	/** Closes scopes, optionally discarding an unpublished speculative copy after a declined edit. */
	release(commit?: boolean): void;
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
	return chunk instanceof MutableChunk && "getEditCursor" in chunk;
}

/**
 * Returns the sum of {@link TreeChunk.topLevelLength} over a chunk sequence.
 * @remarks
 * Indexed sequences maintain this total during edits; other arrays are scanned.
 */
export function getFieldLength(chunks: readonly TreeChunk[]): number {
	return (
		getChunkSequence(chunks)?.length ??
		chunks.reduce((length, chunk) => length + chunk.topLevelLength, 0)
	);
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
	const ends = getChunkSequence(chunks)?.index;
	if (ends !== undefined) {
		const indexOfChunk = findChunkIndex(ends, index);
		const chunk = chunks[indexOfChunk] ?? fail("missing edited node");
		return {
			chunk,
			indexOfChunk,
			indexWithinChunk: index - (indexOfChunk === 0 ? 0 : (ends[indexOfChunk - 1] ?? oob())),
		};
	}
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
