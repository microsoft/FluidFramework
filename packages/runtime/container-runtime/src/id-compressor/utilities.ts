/* eslint-disable no-bitwise */
import { v4 } from "uuid";
import { SessionId, StableId } from "./types";
import { assert } from "./copied-utils/assert";
import { NumericUuid } from "./types/identifiers";
import { LocalCompressedId } from "./test/id-compressor/testCommon";

const hexadecimalCharCodes = Array.from("09afAF").map((c) => c.charCodeAt(0)) as [
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
 */
export function createSessionId(): SessionId {
	return assertIsStableId(v4()) as SessionId;
}

/**
 * Asserts that the given string is a stable ID.
 */
function assertIsStableId(stableId: string): StableId {
	assert(isStableId(stableId), 0x4a3 /* Expected a StableId */);
	return stableId;
}

/**
 * Asserts that the given string is a stable ID.
 */
export function assertIsSessionId(stableId: string): SessionId {
	assert(isStableId(stableId), 0x4a3 /* Expected a StableId */);
	return stableId as SessionId;
}

/**
 * Returns true iff the given string is a valid Version 4, variant 2 UUID
 * 'xxxxxxxx-xxxx-4xxx-vxxx-xxxxxxxxxxxx'
 */
function isStableId(str: string): str is StableId {
	if (str.length !== 36) {
		return false;
	}

	for (let i = 0; i < str.length; i++) {
		switch (i) {
			case 8:
			case 13:
			case 18:
			case 23:
				if (str.charAt(i) !== "-") {
					return false;
				}
				break;

			case 14:
				if (str.charAt(i) !== "4") {
					return false;
				}
				break;

			case 19: {
				const char = str.charAt(i);
				if (char !== "8" && char !== "9" && char !== "a" && char !== "b") {
					return false;
				}
				break;
			}

			default:
				if (!isHexadecimalCharacter(str.charCodeAt(i))) {
					return false;
				}
				break;
		}
	}

	return true;
}

/**
 * A numeric comparator used for sorting in descending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbersReversed<T extends number>(a: T, b: T): number {
	return b - a;
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
// Used to help with stringifying bigints which would otherwise drop trailing zeros
const precisionMask = 0x1n << 128n;

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
	const uuidU128 =
		precisionMask | upperMasked | versionMask | middieBittiesMasked | variantMask | lowerMasked;
	const uuidString = uuidU128.toString(16).substring(1);
	return `${uuidString.substring(0, 8)}-${uuidString.substring(8, 12)}-${uuidString.substring(
		12,
		16,
	)}-${uuidString.substring(16, 20)}-${uuidString.substring(20, 32)}` as StableId;
}

export function offsetNumericUuid(numericUuid: NumericUuid, offset: number): NumericUuid {
	return ((numericUuid as bigint) + BigInt(offset)) as NumericUuid;
}

export function subtractNumericUuids(a: NumericUuid, b: NumericUuid): NumericUuid {
	return (a - b) as NumericUuid;
}

export function addNumericUuids(a: NumericUuid, b: NumericUuid): NumericUuid {
	// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
	return (a + b) as NumericUuid;
}

export function binarySearch<S, T>(
	search: S,
	arr: readonly T[],
	comparator: (a: S, b: T) => number,
): T | undefined {
	let left = 0;
	let right = arr.length - 1;
	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const c = comparator(search, arr[mid]);
		if (c === 0) {
			return arr[mid]; // Found the target, return its index.
		} else if (c > 0) {
			left = mid + 1; // Continue search on right half.
		} else {
			right = mid - 1; // Continue search on left half.
		}
	}
	return undefined; // If we reach here, target is not in array.
}

const float64Buffer = new Float64Array(1);
const float64Uint8 = new Uint8Array(float64Buffer.buffer);

const bigint64Buffer = new BigInt64Array(2);
const bigint64Uint8 = new Uint8Array(bigint64Buffer.buffer);

export function writeNumber(arr: Uint8Array, index: number, value: number): number {
	float64Buffer[0] = value;
	arr.set(float64Uint8, index);
	return index + 8; // Float64Array elements are 8 bytes.
}

const halfNumeric = BigInt("0xFFFFFFFFFFFFFFFF");
const sixtyFour = BigInt(64);
export function writeNumericUuid(arr: Uint8Array, index: number, value: NumericUuid): number {
	bigint64Buffer[0] = value & halfNumeric;
	bigint64Buffer[1] = value >> sixtyFour;
	arr.set(bigint64Uint8, index);
	return index + 16; // BigInt128 values are 16 bytes.
}

export function writeBoolean(arr: Uint8Array, index: number, value: boolean): number {
	arr[index] = value ? 1 : 0;
	return index + 1; // Boolean values are 1 byte.
}

interface Index {
	bytes: Uint8Array;
	index: number;
}

export function readNumber(index: Index): number {
	float64Uint8.set(index.bytes.subarray(index.index, index.index + 8));
	index.index += 8;
	return float64Buffer[0];
}

export function readNumericUuid(index: Index): NumericUuid {
	bigint64Uint8.set(index.bytes.subarray(index.index, index.index + 16));
	const lowerHalf = BigInt.asUintN(64, bigint64Buffer[0]);
	const upperHalf = BigInt.asUintN(64, bigint64Buffer[1]);
	const value = (upperHalf << sixtyFour) | lowerHalf;
	index.index += 16;
	return value as NumericUuid;
}

export function readBoolean(index: Index): boolean {
	const value = index.bytes[index.index] === 1;
	index.index += 1;
	return value;
}
