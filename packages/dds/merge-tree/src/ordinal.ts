/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
import { assert } from "@fluidframework/core-utils/internal";

export function computeHierarchicalOrdinal(
	maxCount: number,
	actualCount: number,
	parentOrdinal: string,
	previousOrdinal: string | undefined,
): string {
	assert(
		maxCount <= 16 && actualCount <= maxCount,
		0x3f0 /* count must be less than max, and max must be 16 or less */,
	);

	const ordinalWidth = 1 << (maxCount - actualCount);
	let ordinal: string;
	if (previousOrdinal === undefined) {
		// Ordinals exist purely for lexicographical sort order and use a small set of valid bytes for each string character.
		// The extra handling fromCodePoint has for things like surrogate pairs is therefore unnecessary.
		// disable the rule to use code points when dealing with ordinals.
		// eslint-disable-next-line unicorn/prefer-code-point
		ordinal = parentOrdinal + String.fromCharCode(ordinalWidth - 1);
	} else {
		// eslint-disable-next-line unicorn/prefer-code-point
		const prevOrdCode = previousOrdinal.charCodeAt(previousOrdinal.length - 1);
		assert(prevOrdCode !== undefined, 0x9ad /* previous ordinal should not be empty */);
		const localOrdinal = prevOrdCode + ordinalWidth;
		// eslint-disable-next-line unicorn/prefer-code-point
		ordinal = parentOrdinal + String.fromCharCode(localOrdinal);
	}

	return ordinal;
}
