/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { v4 } from 'uuid';
import { MinimalUuidString, SessionId } from '..';
import { assert, fail } from '../Common';
import { StableId, UuidString } from '../Identifiers';

/**
 * A UUID (128 bit identifier) optimized for use as a 128 bit unsigned integer with fast addition and toString operations.
 * The string entry is the upper 76 bits of the uuid and the integer entry holds the lower 52 bits:
 * UUUUUUUU-UUUU-VUUU-vUUU-UUUUUUUUUUUU - the uuid
 * SSSSSSSS SSSS SSSS SSS               - array[0]: string
 *                       N NNNNNNNNNNNN - array[1]: integer
 * The integer keeps the common case cost of incrementing and computing deltas very low.
 * The string optimizes toString by caching the the majority of the resulting string.
 */
export type NumericUuid = readonly [string, number] & {
	readonly NumericUuid: '9132ea20-a811-4756-85f8-aa6da5ca90f8';
};

const bitsInNumericUuidInteger = 52; // Not tunable. Do not change.
const nibblesInNumericUuidInteger = bitsInNumericUuidInteger / 4;
const nibblesInNumericString = 32 - nibblesInNumericUuidInteger;
const maxNumericUuidInteger = 2 ** bitsInNumericUuidInteger - 1;
const nonOverlappingStringLength = 18;
const fiftyThirdBit = 2 ** 52;

/**
 * Calculates the numeric delta between a and b (i.e. a - b).
 * @param a an uuid
 * @param b an other uuid
 * @param maxDelta the maximum integer delta (inclusive) to tolerate.
 * @returns undefined if the delta is negative or greater than `maxDelta`
 */
export function getPositiveDelta(a: NumericUuid, b: NumericUuid, maxDelta: number): number | undefined {
	const [stringA, lowNumberA] = a;
	const [stringB, lowNumberB] = b;

	if (!stringA.startsWith(stringB.slice(0, nonOverlappingStringLength))) {
		return undefined;
	}

	const lowestStringNibbleA = Number.parseInt(stringA.charAt(nonOverlappingStringLength), 16);
	const lowestStringNibbleB = Number.parseInt(stringB.charAt(nonOverlappingStringLength), 16);
	// If the lowest bit in each string is set - which corresponds to 2^52 - selectively add that amount to our numbers.
	const numberA = (lowestStringNibbleA & 0x1 ? fiftyThirdBit : 0) + lowNumberA;
	const numberB = (lowestStringNibbleB & 0x1 ? fiftyThirdBit : 0) + lowNumberB;
	const numberDelta = numberA - numberB;

	// This switch compares the values of the 54th (low order) bits of `a` and `b`. The 54th bit corresponds to a delta of 2^53 between
	// `a` and `b`. We can't safely add it into our numbers like we did with the 52nd bit above, because that might exceed MAX_SAFE_INTEGER.
	switch (((lowestStringNibbleA & 0x2) >> 1) - ((lowestStringNibbleB & 0x2) >> 1)) {
		case 1: {
			if (numberDelta >= 0) {
				// We know that `a` exceeds `b` by more than 2^53, which is greater than MAX_SAFE_INTEGER and thus invalid.
				return undefined;
			}

			// `a` exceeds `b` by some value less than or equal to 2^53, so compute what that value is.
			const result = Number.MAX_SAFE_INTEGER + (numberDelta + 1);
			if (result > maxDelta) {
				return undefined;
			}

			return result;
		}
		case 0: {
			if (numberDelta < 0 || numberDelta > maxDelta) {
				return undefined;
			}
			return numberDelta;
		}
		default:
			return undefined;
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
 * @param offset an optional offset to increment the returned StableId
 * @returns the string representation of a `NumericUuid`.
 */
export function stableIdFromNumericUuid(uuid: NumericUuid, offset = 0): StableId {
	const lowerAdd = uuid[1] + offset;
	// Common fast-path
	if (lowerAdd <= maxNumericUuidInteger) {
		return (uuid[0] + padToLengthWithZeros(lowerAdd.toString(16), nibblesInNumericUuidInteger)) as StableId;
	}
	return stableIdFromNumericUuid(incrementUuid(uuid, offset));
}

/**
 * @returns the supplied uuid with added separators.
 */
export function expandUuidString(uuid: StableId): UuidString {
	if (uuid.length !== 32) {
		if (uuid.length !== 36) {
			fail(`${uuid} is not a uuid.`);
		}
		return uuid as unknown as UuidString;
	}
	return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(
		20,
		32
	)}` as UuidString;
}

/**
 * @returns the supplied uuid with "-" separators removed.
 */
export function minimizeUuidString(uuid: UuidString): MinimalUuidString {
	if (uuid.length !== 32) {
		if (uuid.length !== 36) {
			fail(`${uuid} is not a uuid.`);
		}
		return `${uuid.slice(0, 8)}${uuid.slice(9, 13)}${uuid.slice(14, 18)}${uuid.slice(19, 23)}${uuid.slice(
			24,
			36
		)}` as StableId;
	}
	return uuid as unknown as StableId;
}

/**
 * @param uuidString a minimal uuid string
 * @returns a numeric representation of `uuidString`, or undefined if `uuidString` is not a valid v4 uuid.
 */
export function numericUuidFromUuidString(uuidString: MinimalUuidString): NumericUuid | undefined {
	assertIsMinimalUuidString(uuidString);
	const versionNibble = uuidString.charAt(12);
	if (versionNibble !== '4') {
		return undefined;
	}

	const variantNibble = uuidString.charAt(16);
	if (variantNibble !== '8' && variantNibble !== '9' && variantNibble !== 'a' && variantNibble !== 'b') {
		return undefined;
	}

	const uuid: (string | number)[] = new Array(2);
	uuid[0] = uuidString.substr(0, nibblesInNumericString);
	uuid[1] = Number.parseInt(uuidString.substr(nibblesInNumericString, nibblesInNumericUuidInteger), 16);
	return uuid as readonly (number | string)[] as NumericUuid;
}

/**
 * Asserts that the supplied UUID string is of the correct form.
 */
export function assertIsMinimalUuidString(uuid: MinimalUuidString) {
	if (uuid.length !== 32) {
		if (uuid.length === 36) {
			fail('uuid must not contain separators');
		}
		fail(`${uuid} is not a uuid.`);
	}
}

/**
 * Creates a session base ID.
 * This method (rather than standard uuid generation methods) should be used to generate session IDs.
 */
export function createSessionUuid(): SessionId {
	const uuid = minimizeUuidString(v4() as UuidString) as StableId;
	return ensureSessionUuid(uuid);
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
 * @returns the result of incrementing the uuid by `amount`.`
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
		const overflow = amount - (maxNumericUuidInteger - uuid[1]) - 1;
		const uuidString = uuid[0];
		const variantChunkString = uuidString.substr(13, 6);
		const [newVariantChunkString, carried] = VariantChunk.increment(variantChunkString);

		if (carried) {
			// The variant chunk itself also overflowed. We'll need to carry the overflow further, into the upper string region of the UUID.
			const upperString = uuidString.substr(0, 12);
			const upperNumber = Number.parseInt(upperString, 16);
			assert(upperNumber <= maxUpperNumber);
			const newUpperNumber = upperNumber + 1;
			if (newUpperNumber > maxUpperNumber) {
				fail('Exceeded maximum numeric UUID');
			} else {
				// The variant chunk overflowed but the upper string region did not. Splice in the incremented string region.
				newUuid = [`${padToLengthWithZeros(upperString, 12)}4${newVariantChunkString}`, overflow];
			}
		} else {
			// The variant chunk did not overflow, so just splice it back in.
			newUuid = [`${uuidString.substr(0, 12)}4${newVariantChunkString}`, overflow];
		}
	}

	return newUuid as readonly [string, number] as NumericUuid;
}

namespace VariantChunk {
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

	/**
	 * Given a hex string representing the variant chunk, add one to it.
	 * @returns the resulting hex string and whether or not the new value overflowed, i.e. it exceeds `maxVariantNumber`. In this case,
	 * the resulting hex string will wrap around to its minimum value '000b00'
	 */
	export function increment(variantChunk: string): [newVariantChunk: string, overflowed: boolean] {
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
		const variantChunkBits = Number.parseInt(variantChunk, 16);
		// 2. The numerically important bits (i.e. not the variant identifier bits _vv_ which are constant) are extracted into a single number
		const upperVariantBits = (variantChunkBits & upperVariantChunkMask) >> 2;
		const middleVariantBits = variantChunkBits & middleVariantChunkMask;
		const lowerVariantBits = variantChunkBits & lowerVariantChunkMask;
		const variantNumber = upperVariantBits + middleVariantBits + lowerVariantBits;
		assert(variantNumber <= maxVariantNumber);
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

const maxUpperUuid = 'ffffffffffff4fff';
const maxUpperUuidVersionIndex = maxUpperUuid.indexOf('4');
const newNibbles = ['7', 'B', 'D', 'E'];

/**
 * Any session uuid with all of its highish bits set is in danger of overflowing after fewer than 2^53 increments.
 * By zeroing one of those bits at random, potential overflow is prevented.
 */
export function ensureSessionUuid(uuid: StableId): SessionId {
	if (uuid.startsWith(maxUpperUuid)) {
		let nibbleIndex = Math.floor(Math.random() * (maxUpperUuid.length - 1));
		if (nibbleIndex >= maxUpperUuidVersionIndex) {
			nibbleIndex += 1;
		}
		const newNibble = newNibbles[Math.floor(Math.random() * newNibbles.length)]; // Randomly choose a bit to zero
		const newUuid = uuid.slice(0, nibbleIndex) + newNibble + uuid.slice(nibbleIndex + 1);
		return newUuid as SessionId;
	}

	return uuid as SessionId;
}
