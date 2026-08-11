/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { assertWithMessage, fail } from '../Common.js';
import { SessionId, StableId } from '../Identifiers.js';
import { generateStableId } from '../UuidUtilities.js';

/**
 * A UUID (128 bit identifier) optimized for use as a 128 bit unsigned integer with fast addition and toString operations.
 * The string entry is the upper 76 bits of the uuid and the integer entry holds the lower 52 bits:
 *
 * ```
 * UUUUUUUU-UUUU-VUUU-vUUU-UUUUUUUUUUUU - the uuid
 * SSSSSSSS-SSSS-SSSS-SSS               - array[0]: string
 *                       N NNNNNNNNNNNN - array[1]: integer
 * ```
 *
 * The integer keeps the common case cost of incrementing and computing deltas very low.
 * The string optimizes toString by caching the the majority of the resulting string.
 */
export type NumericUuid = readonly [string, number] & {
	readonly NumericUuid: '9132ea20-a811-4756-85f8-aa6da5ca90f8';
};

const bitsInNumericUuidInteger = 52; // Not tunable. Do not change.
const nibblesInNumericUuidInteger = bitsInNumericUuidInteger / 4;
const stringEntryLength = 22;
const maxNumericUuidInteger = 2 ** bitsInNumericUuidInteger - 1;
const fiftyThirdBit = 2 ** 52;

/**
 * Calculates the numeric delta between a and b (i.e. a - b).
 * @param a - an uuid
 * @param b - an other uuid
 * @param maxDelta - the maximum integer delta (inclusive) to tolerate.
 * @returns undefined if the delta is negative or greater than `maxDelta`
 */
export function getPositiveDelta(a: NumericUuid, b: NumericUuid, maxDelta: number): number | undefined {
	const [stringEntryA, lowNumberA] = a;
	const [stringEntryB, lowNumberB] = b;

	if (stringEntryA === stringEntryB) {
		const difference = lowNumberA - lowNumberB;
		if (difference >= 0 && difference <= maxDelta) {
			return difference;
		}
		return undefined;
	}

	const highNumberA = Number.parseInt(ChunkMath.Upper.parse(stringEntryA), 16);
	const highNumberB = Number.parseInt(ChunkMath.Upper.parse(stringEntryB), 16);

	let subtractHigh = highNumberA - highNumberB;
	if (Math.abs(subtractHigh) > 1) {
		// If the high bits differ by more than 1, then there is no chance that any lower bits could compensate
		return undefined;
	}

	let midNumberA = ChunkMath.getNumericValue(ChunkMath.Variant.parse(stringEntryA));
	const midNumberB = ChunkMath.getNumericValue(ChunkMath.Variant.parse(stringEntryB));

	let subtractLow = lowNumberA - lowNumberB;
	if (subtractLow < 0) {
		midNumberA -= 1;
		subtractLow += fiftyThirdBit;
	}

	let subtractMid = midNumberA - midNumberB;
	if (subtractMid < 0) {
		subtractHigh -= 1;
		subtractMid += ChunkMath.twentyThirdBit;
	}

	if (subtractHigh !== 0) {
		// a < b, no positive delta, or
		// a > b by much more than MAX_SAFE_INTEGER
		return undefined;
	}

	if (subtractMid > 1) {
		return undefined;
	} else {
		const trueDelta = fiftyThirdBit * subtractMid + subtractLow;
		return trueDelta > maxDelta ? undefined : trueDelta;
	}
}

// Pre-allocated array of strings of zeros.
// Used to pad hex strings up to 52 bits
const zeros: string[] = [];
for (let i = 0; i < nibblesInNumericUuidInteger; i++) {
	zeros.push('0'.repeat(i));
}

function padToLengthWithZeros(str: string, count: number): string {
	return str.length === count ? str : zeros[count - str.length] + str;
}

/**
 * @param offset - an optional offset to increment the returned StableId
 * @returns the string representation of a `NumericUuid`.
 */
export function stableIdFromNumericUuid(uuid: NumericUuid, offset = 0): StableId {
	const lowerAdd = uuid[1] + offset;
	// Common fast-path
	if (lowerAdd <= maxNumericUuidInteger) {
		const lowerString = padToLengthWithZeros(lowerAdd.toString(16), nibblesInNumericUuidInteger);
		return `${uuid[0] + lowerString.slice(0, 1)}-${lowerString.slice(1)}` as StableId;
	}
	return stableIdFromNumericUuid(incrementUuid(uuid, offset));
}

/**
 * @param stableId - a minimal uuid string
 * @returns a numeric representation of `stableId`.
 */
export function numericUuidFromStableId(stableId: StableId): NumericUuid {
	const uuid: (string | number)[] = new Array(2);
	uuid[0] = stableId.slice(0, stringEntryLength);
	uuid[1] = Number.parseInt(ChunkMath.Lower.parse(stableId), 16);
	return uuid as readonly (number | string)[] as NumericUuid;
}

/**
 * Creates a session base ID.
 * This method (rather than standard uuid generation methods) should be used to generate session IDs.
 */
export function createSessionId(): SessionId {
	return ensureSessionUuid(generateStableId());
}

/**
 * Compares numeric uuids for equality.
 */
export function numericUuidEquals(a: NumericUuid, b: NumericUuid): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

/**
 * The maximum value that can be contained in the upper string region of a numeric UUID (i.e. the string region excluding the version
 * nibble and the variant chunk)
 */
const maxUpperNumber = 2 ** 48 - 1;

/**
 * Increments the uuid. `amount` must be a positive integer.
 * @returns the result of incrementing the uuid by `amount`.
 */
export function incrementUuid(uuid: NumericUuid, amount: number): NumericUuid {
	/*
	 * UUIDs incremented beyond the max UUID "ffffffff-ffff-4fff-bfff-ffffffffffff" will cause a failure.
	 * Also, some reserved bits of the v4 UUID must be treated as immutable (e.g. the version and
	 * variant bits) and thus must not be incremented.
	 */
	let newUuid: [string, number];
	const result = uuid[1] + amount;
	if (result <= maxNumericUuidInteger) {
		// The new number still fits within the number region of a numeric UUID.
		// Incrementing is usually done with small amounts, so this is the dominantly common case.
		newUuid = [uuid[0], result];
	} else {
		// The numeric UUID's number region has overflowed. We will need to carry the overflow into the variant chunk (see `VariantChunk`).
		/** The amount left over after filling up the rest of the uuid's number region with the increment amount */
		const remainder = amount - (maxNumericUuidInteger - uuid[1]) - 1;
		const stringEntry = uuid[0];
		const [newVariantChunkString, carried] = ChunkMath.increment(stringEntry);

		if (carried) {
			// The variant chunk itself also overflowed. We'll need to carry the overflow further, into the upper string region of the UUID.
			const upperString = ChunkMath.Upper.parse(stringEntry);
			const upperNumber = Number.parseInt(upperString, 16);
			assertWithMessage(upperNumber <= maxUpperNumber);
			const newUpperNumber = upperNumber + 1;
			if (newUpperNumber > maxUpperNumber) {
				fail('Exceeded maximum numeric UUID');
			} else {
				// The variant chunk overflowed but the upper string region did not. Splice in the incremented string region.
				const newUpperChunk = padToLengthWithZeros(newUpperNumber.toString(16), 12);
				newUuid = [
					`${ChunkMath.Upper.hyphenate(newUpperChunk)}-4${ChunkMath.Variant.hyphenate(newVariantChunkString)}`,
					remainder,
				];
			}
		} else {
			// The variant chunk did not overflow, so just splice it back in.
			newUuid = [
				`${ChunkMath.Upper.slice(stringEntry)}-4${ChunkMath.Variant.hyphenate(newVariantChunkString)}`,
				remainder,
			];
		}
	}

	return newUuid as readonly [string, number] as NumericUuid;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ChunkMath {
	/*
	 * Recall the UUID diagram from the top of this file which describes the layout of a Numeric UUID. To implement addition, we define
	 * another region called the "variant chunk" which overlaps with the "string" region. Note that it is just beneath the required v4 uuid
	 * version identifier (the 13th nibble 'V' which is always '4' in a v4 UUID) and just above the "number" region of the layout. It
	 * contains inside of it the v4 UUID variant identifier bits as well (see https://datatracker.ietf.org/doc/html/rfc4122#section-4.1.1).
	 *
	 * UUUUUUUU-UUUU-VUUU-vUUU-UUUUUUUUUUUU - the uuid
	 * SSSSSSSS SSSS SSSS SSS               - array[0]: string
	 *                       N NNNNNNNNNNNN - array[1]: integer
	 *                VVV-VVV               - the variant chunk
	 *
	 * By defining the variant chunk in this way it is simple to splice in the v4 UUID version identifier ('V') just above it and any
	 * "bit math" required due to the fact that the variant identifier bits ('v') do not fill up an entire nibble is handled within it.
	 * The variant chunk is made up of 6 nibbles. Note the "vv" which denotes the two bits used for the v4 UUID variant identifier:
	 *
	 * AAAA BBBB CCCC vvDD EEEE FFFF
	 *
	 * Since we'll be needing to "skip" the variant bits ("vv") when doing addition, we define a a few masks which will be used below to
	 * separate the variant chunk into pieces before recombining it:
	 */

	//                                         AAAA BBBB CCCC vvDD EEEE FFFF
	const upperVariantChunkMask = 0xfff000; // XXXX XXXX XXXX
	const variantBitMask = 0x800; //                          XX
	const middleVariantChunkMask = 0x300; //                    XX
	const lowerVariantChunkMask = 0xff; //                         XXXX XXXX

	/** The maximum numeric value that can be represented by the numerically relevant bits in the variant chunk */
	const maxVariantNumber = 2 ** 22 - 1;

	export const twentyThirdBit = 2 ** 22;

	/**
	 * The upper chunk, denoted by 'U's in UUUUUUUU-UUUU-VVVV-vVVL-LLLLLLLLLLLL
	 */
	// eslint-disable-next-line @typescript-eslint/no-namespace
	export namespace Upper {
		export function parse(stringEntry: string): string {
			return stringEntry.slice(0, 8) + stringEntry.slice(9, 13);
		}

		export function hyphenate(upperChunk: string): string {
			return `${upperChunk.slice(0, 8)}-${upperChunk.slice(8)}`;
		}

		export function slice(stringEntry: string): string {
			return stringEntry.slice(0, 13);
		}
	}

	/**
	 * The variant chunk, denoted by 'V's in UUUUUUUU-UUUU-VVVV-vVVL-LLLLLLLLLLLL
	 */
	// eslint-disable-next-line @typescript-eslint/no-namespace
	export namespace Variant {
		export function parse(stringEntry: string): string {
			return stringEntry.slice(15, 18) + stringEntry.slice(19, 22);
		}

		export function hyphenate(variantChunk: string): string {
			return `${variantChunk.slice(0, 3)}-${variantChunk.slice(3)}`;
		}
	}

	/**
	 * The lower chunk, denoted by 'L's in UUUUUUUU-UUUU-VVVV-vVVL-LLLLLLLLLLLL
	 */
	// eslint-disable-next-line @typescript-eslint/no-namespace
	export namespace Lower {
		export function parse(stableId: StableId): string {
			return stableId.slice(stringEntryLength, stringEntryLength + 1) + stableId.slice(stringEntryLength + 2);
		}

		export function hyphenate(lowerChunk: string): string {
			return `${lowerChunk.slice(0, 1)}-${lowerChunk.slice(1)}`;
		}
	}

	/**
	 * Returns the number representation of the given bits corresponding to the variant chunk. The value is derived by
	 * parsing all bits except for reserved bits (i.e. the variant bits).
	 * @param variantChunk - the variantChunk
	 */
	export function getNumericValue(variantChunk: string): number {
		const variantChunkBits = Number.parseInt(variantChunk, 16);
		const upperVariantBits = (variantChunkBits & upperVariantChunkMask) >> 2;
		const middleVariantBits = variantChunkBits & middleVariantChunkMask;
		const lowerVariantBits = variantChunkBits & lowerVariantChunkMask;
		return upperVariantBits + middleVariantBits + lowerVariantBits;
	}

	/**
	 * Given the string portion of a numeric uuid, add one to it.
	 * @returns the resulting hex string and whether or not the new value overflowed, i.e. it exceeds `maxVariantNumber`. In this case,
	 * the resulting hex string will wrap around to its minimum value '000b00'
	 */
	export function increment(stringEntry: string): [newVariantChunk: string, overflowed: boolean] {
		// To implement addition, the variant identifier bits are extracted from the variant chunk, the chunk is interpreted as a number,
		// that number is incremented by 1, and then the variant identifier bits are returned as we convert the number back into a hex
		// string.

		// This diagram may be helpful for seeing how the nibbles line up before and after the variant identifier bits are extracted. The
		// letters used for each nibble ("AAAA", "BBBB") etc. are arbitrary and are simply there to differentiate the nibbles as they shift.
		// --------------------------------
		// 1. AAAA BBBB CCCC vvDD EEEE FFFF
		// 2.   AA AABB BBCC CCDD EEEE FFFF
		// 3.   AA AABB BBCC CCDD EEEE FFFF
		//                              + 1
		//    = GG GGHH HHII IIJJ JJKK KKLL
		// 4. GGGG HHHH IIII vvJJ JJKK KKLL

		// 1. The variant chunk is given as a 6 character (6 nibble) hex string, where the fourth nibble contains the variant bits
		// 2. The numerically important bits (i.e. not the variant identifier bits vv which are constant) are extracted into a single number
		const variantChunk = Variant.parse(stringEntry);
		const variantNumber = getNumericValue(variantChunk);
		assertWithMessage(variantNumber <= maxVariantNumber);
		// 3. Add one to the variant number to produce our new variant number.
		const newVariantNumber = variantNumber + 1;
		// 4. The variant identifier bits are added back into the number, which is then turned back into a hex string
		const newUpperVariantBits = (newVariantNumber & (upperVariantChunkMask >> 2)) << 2;
		const newMiddleVariantBits = (newVariantNumber & middleVariantChunkMask) | variantBitMask; // Add the variant bits back in
		const newLowerVariantBits = newVariantNumber & lowerVariantChunkMask;
		const newVariantChunkBits = newUpperVariantBits + newMiddleVariantBits + newLowerVariantBits;
		const newVariantChunk = padToLengthWithZeros(newVariantChunkBits.toString(16), variantChunk.length);
		return [newVariantChunk, newVariantNumber > maxVariantNumber];
	}
}

const maxUpperUuid = 'ffffffff-ffff-4fff-bf';
const maxNibbleCount = [...maxUpperUuid].filter((n) => n === 'f').length;
const newNibbles = ['7', 'b', 'd', 'e'];
function isMaxUpperNibble(index: number): boolean {
	return maxUpperUuid.charAt(index) === 'f';
}

/**
 * Any session uuid with all of its highish bits set is in danger of overflowing after fewer than 2^53 increments.
 * By zeroing one of those bits at random, potential overflow is prevented.
 */
export function ensureSessionUuid(uuid: StableId): SessionId {
	if (uuid.startsWith(maxUpperUuid)) {
		const targetNibble = Math.floor(Math.random() * maxNibbleCount);
		let actualIndex = 0;
		for (let nibbleIndex = 0; nibbleIndex < targetNibble && !isMaxUpperNibble(actualIndex); actualIndex += 1) {
			if (isMaxUpperNibble(actualIndex)) {
				nibbleIndex++;
			}
		}

		const newNibble = newNibbles[Math.floor(Math.random() * newNibbles.length)]; // Randomly choose a bit to zero
		const newUuid = uuid.slice(0, actualIndex) + newNibble + uuid.slice(actualIndex + 1);
		return newUuid as SessionId;
	}

	return uuid as SessionId;
}
