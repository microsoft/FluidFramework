/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "./schema.js";

/**
 * Sync `newText` into the provided `root` tree.
 */
export function syncTextToTree(root: TextAsTree.Tree, newText: string): void {
	const sync = computeSync(root.charactersCopy(), [...newText]);

	if (sync.remove) {
		root.removeRange(sync.remove.start, sync.remove.end);
	}
	if (sync.insert) {
		root.insertAt(sync.insert.location, sync.insert.slice.join(""));
	}
}

/**
 * Sync `newText` into the provided `root` tree.
 *
 * TODO: unit tests for this.
 */
export function computeSync<T>(
	existing: readonly T[],
	final: readonly T[],
): { remove?: { start: number; end: number }; insert?: { location: number; slice: T[] } } {
	// Find common prefix and suffix to minimize changes

	let prefixLength = 0;
	while (
		prefixLength < existing.length &&
		prefixLength < final.length &&
		existing[prefixLength] === final[prefixLength]
	) {
		prefixLength++;
	}

	let suffixLength = 0;
	while (
		suffixLength + prefixLength < existing.length &&
		suffixLength + prefixLength < final.length &&
		existing[existing.length - 1 - suffixLength] === final[final.length - 1 - suffixLength]
	) {
		suffixLength++;
	}

	// Locate middle replaced range in existing and final
	const existingMiddleStart = prefixLength;
	const existingMiddleEnd = existing.length - suffixLength;
	const newMiddleStart = prefixLength;
	const newMiddleEnd = final.length - suffixLength;

	return {
		remove:
			existingMiddleStart < existingMiddleEnd
				? { start: existingMiddleStart, end: existingMiddleEnd }
				: undefined,
		insert:
			newMiddleStart < newMiddleEnd
				? {
						location: existingMiddleStart,
						slice: final.slice(newMiddleStart, newMiddleEnd),
					}
				: undefined,
	};
}
