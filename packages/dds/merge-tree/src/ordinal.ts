/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
import { assert } from "@fluidframework/core-utils";

export function computeHierarchicalOrdinal(
	maxCount: number,
	actualCount: number,
	parentOrdinal: string,
	previousOrdinal: string | undefined,
) {
	assert(
		maxCount <= 16 && actualCount <= maxCount,
		0x3f0 /* count must be less than max, and max must be 16 or less */,
	);

	const ordinalWidth = 1 << (maxCount - actualCount);
	let ordinal: string;
	if (previousOrdinal === undefined) {
		ordinal = parentOrdinal + String.fromCharCode(ordinalWidth - 1);
	} else {
		const prevOrdCode = previousOrdinal.charCodeAt(previousOrdinal.length - 1);
		const localOrdinal = prevOrdCode + ordinalWidth;
		ordinal = parentOrdinal + String.fromCharCode(localOrdinal);
	}

	return ordinal;
}
