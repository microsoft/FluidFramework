/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Ensures that 0 \<= 'value' \< 'limit'.  Throws a RangeError otherwise.
 */
export function ensureRange(value: number, limit: number): void {
	// Coerce 'value' to Uint32 so that we can range check with a single branch.
	const _value = value >>> 0; // eslint-disable-line no-bitwise

	if (_value >= limit) {
		throw new RangeError("Invalid (row, col) coordinate.");
	}
}
