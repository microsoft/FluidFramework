/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, oob } from "@fluidframework/core-utils/internal";

import type { TreeChunk } from "../../core/index.js";
import { assertNonNegativeSafeInteger } from "../../util/index.js";

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
