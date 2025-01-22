/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
import { assert } from "@fluidframework/core-utils/internal";
import { v4 } from "uuid";

import { LocalCompressedId, NumericUuid } from "./identifiers.js";
import { SessionId, StableId } from "./types/index.js";

const hexadecimalCharCodes = [..."09afAF"].map((c) => c.codePointAt(0)) as [
	zero: number,
	nine: number,
	a: number,
	f: number,
	A: number,
	F: number,
];

function isHexadecimalCharacter(charCode: number): boolean {
	return (
		(charCode >= hexadecimalCharCodes[0] && charCode <= hexadecimalCharCodes[1]) ||
		(charCode >= hexadecimalCharCodes[2] && charCode <= hexadecimalCharCodes[3]) ||
		(charCode >= hexadecimalCharCodes[4] && charCode <= hexadecimalCharCodes[5])
	);
}

/**
 * Generate a random session ID
 * @legacy
 * @alpha
 */
export function createSessionId(): SessionId {
	return assertIsStableId(v4()) as SessionId;
}

/**
 * Asserts that the given string is a stable ID.
 * @internal
 */
export function assertIsStableId(stableId: string): StableId {
	assert(isStableId(stableId), 0x4a3 /* Expected a StableId */);
	return stableId;
}

/**
 * Asserts that the given string is a stable ID.
 */
export function assertIsSessionId(stableId: string): SessionId {
	assertIsStableId(stableId);
	return stableId as SessionId;
}

/**
 * Generate a random stable ID
 * @internal
 */
export function generateStableId(): StableId {
	return assertIsStableId(v4());
}

/**
 * Returns true iff the given string is a valid Version 4, variant 2 UUID
 * 'xxxxxxxx-xxxx-4xxx-vxxx-xxxxxxxxxxxx'
 * @internal
 */
export function isStableId(str: string): str is StableId {
	if (str.length !== 36) {
		return false;
	}

	for (let i = 0; i < str.length; i++) {
		switch (i) {
			case 8:
			case 13:
			case 18:
			case 23: {
				if (str.charAt(i) !== "-") {
					return false;
				}
				break;
			}

			case 14: {
				if (str.charAt(i) !== "4") {
					return false;
				}
				break;
			}

			case 19: {
				const char = str.charAt(i);
				if (char !== "8" && char !== "9" && char !== "a" && char !== "b") {
					return false;
				}
				break;
			}

			default: {
				const codePoint = str.codePointAt(i);
				assert(codePoint !== undefined, "Unexpected undefined code point");
				if (!isHexadecimalCharacter(codePoint)) {
					return false;
				}
				break;
			}
		}
	}

	return true;
}

/**
 * A numeric comparator used for sorting in ascending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbers<T extends number>(a: T, b: T): number {
	return a - b;
}

/**
 * Compares strings lexically to form a strict partial ordering.
 */
export function compareStrings<T extends string>(a: T, b: T): number {
	return a > b ? 1 : a === b ? 0 : -1;
}

/**
 * Compares bigints to form a strict partial ordering.
 */
export function compareBigints<T extends bigint>(a: T, b: T): number {
	return a > b ? 1 : a === b ? 0 : -1;
}

export function genCountFromLocalId(localId: LocalCompressedId): number {
	return -localId;
}

export function localIdFromGenCount(genCount: number): LocalCompressedId {
	return -genCount as LocalCompressedId;
}

// xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
const versionMask = 0x4n << (19n * 4n); // Version 4
const variantMask = 0x8n << (15n * 4n); // Variant RFC4122 (1 0 x x)
const upperMask = 0xffffffffffffn << (20n * 4n);
// Upper mask when version/variant bits are removed
const strippedUpperMask = upperMask >> 6n;
const middieBittiesMask = 0xfffn << (16n * 4n);
// Middie mask when version/variant bits are removed
const strippedMiddieBittiesMask = middieBittiesMask >> 2n;
// Note: leading character should be 3 to mask at 0011
// The more-significant half of the N nibble is used to denote the variant (10xx)
const lowerMask = 0x3fffffffffffffffn;

export function numericUuidFromStableId(stableId: StableId): NumericUuid {
	const uuidU128 = BigInt(`0x${stableId.replace(/-/g, "")}`);
	const upperMasked = uuidU128 & upperMask;
	const middieBittiesMasked = uuidU128 & middieBittiesMask;
	const lowerMasked = uuidU128 & lowerMask;

	const upperMaskedPlaced = upperMasked >> 6n;
	const middieBittiesMaskedPlaced = middieBittiesMasked >> 2n;

	const id = upperMaskedPlaced | middieBittiesMaskedPlaced | lowerMasked;
	return id as NumericUuid;
}

export function stableIdFromNumericUuid(numericUuid: NumericUuid): StableId {
	// bitwise reverse transform
	const upperMasked = (numericUuid & strippedUpperMask) << 6n;
	const middieBittiesMasked = (numericUuid & strippedMiddieBittiesMask) << 2n;
	const lowerMasked = numericUuid & lowerMask;
	const uuidU128 = upperMasked | versionMask | middieBittiesMasked | variantMask | lowerMasked;
	// Pad to 32 characters, inserting leading zeroes if needed
	const uuidString = uuidU128.toString(16).padStart(32, "0");
	return `${uuidString.slice(0, 8)}-${uuidString.slice(8, 12)}-${uuidString.slice(
		12,
		16,
	)}-${uuidString.slice(16, 20)}-${uuidString.slice(20, 32)}` as StableId;
}

export function offsetNumericUuid(numericUuid: NumericUuid, offset: number): NumericUuid {
	return (numericUuid + BigInt(offset)) as NumericUuid;
}

export function subtractNumericUuids(a: NumericUuid, b: NumericUuid): NumericUuid {
	return (a - b) as NumericUuid;
}

export function addNumericUuids(a: NumericUuid, b: NumericUuid): NumericUuid {
	return (a + b) as NumericUuid;
}
