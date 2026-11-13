/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, oob } from "@fluidframework/core-utils/internal";

import type { TreeChunk } from "../../core/index.js";
import { assertNonNegativeSafeInteger } from "../../util/index.js";

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
