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
	if (previousOrdinal === undefined || previousOrdinal === "") {
		ordinal = parentOrdinal + String.fromCodePoint(ordinalWidth - 1);
	} else {
		const prevOrdCode = previousOrdinal.codePointAt(previousOrdinal.length - 1);
		assert(prevOrdCode !== undefined, "previous ordinal should not be empty");
		const localOrdinal = prevOrdCode + ordinalWidth;
		ordinal = parentOrdinal + String.fromCodePoint(localOrdinal);
	}

	return ordinal;
}
