/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "@fluidframework/tree/internal";

/**
 * Returns the number of Unicode code points in `str`.
 * Used to convert a JS string length (UTF-16) to tree atom counts (code points).
 * @internal
 */
export function codepointCount(str: string): number {
	return [...str].length;
}

/**
 * Returns the number of UTF-16 code units occupied by the first `cpCount` Unicode
 * code points in `str`, starting at UTF-16 index `start`.
 * Used to convert tree atom counts (code points) to string positions (UTF-16).
 * @internal
 */
export function cpCountToUtf16(str: string, start: number, cpCount: number): number {
	let utf16 = 0;
	let counted = 0;
	while (counted < cpCount && start + utf16 < str.length) {
		utf16 += (str.codePointAt(start + utf16) ?? 0) > 0xffff ? 2 : 1;
		counted++;
	}
	return utf16;
}

/**
 * Sync `newText` into the provided `root` tree.
 * @internal
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
