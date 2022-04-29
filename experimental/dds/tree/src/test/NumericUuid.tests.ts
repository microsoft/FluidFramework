/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { expect } from 'chai';
import Random from 'random-js';
import { compareStrings } from '../Common';
import {
	numericUuidEquals,
	createSessionId,
	getPositiveDelta,
	incrementUuid,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
	ensureSessionUuid,
	isStableId,
	assertIsStableId,
} from '../id-compressor/NumericUuid';
import { StableId } from '../Identifiers';
import { integerToStableId } from './utilities/IdCompressorTestUtilities';
import { makeRandom } from './utilities/TestUtilities';

describe('NumericUuid', () => {
	it('can detect non-v4 variant 2 UUIDs', () => {
		expect(isStableId('00000000-0000-0000-0000-000000000000')).to.be.false;
		expect(isStableId('ffffffff-ffff-ffff-ffff-ffffffffffff')).to.be.false;
		expect(isStableId('8e8fec9a10ea4d158308ed35bc7f1e66')).to.be.false;
		expect(isStableId('8e8fec9a-10ea-4d15-8308-ed35bc7f1e66')).to.be.true;
		[...new Array(16).keys()]
			.map((n) => [n, n.toString(16)])
			.forEach(([n, char]) => {
				const expectUuidVersion = expect(isStableId(`00000000-0000-${char}000-b000-000000000000`));
				if (char === '4') {
					expectUuidVersion.to.be.true;
				} else {
					expectUuidVersion.to.be.false;
				}

				const expectUuidVariant = expect(isStableId(`00000000-0000-4000-${char}000-000000000000`));
				if (n >= 8 && n <= 11) {
					expectUuidVariant.to.be.true;
				} else {
					expectUuidVariant.to.be.false;
				}
			});
	});

	const maxStableId = assertIsStableId('ffffffff-ffff-4fff-bfff-ffffffffffff');

	it('detects increment overflow', () => {
		const uuid = numericUuidFromStableId(maxStableId);
		expect(() => stableIdFromNumericUuid(uuid, 1)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, 1))).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(uuid, 256)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, 256))).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(uuid, Number.MAX_SAFE_INTEGER)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, Number.MAX_SAFE_INTEGER))).to.throw(
			'Exceeded maximum numeric UUID'
		);
	});

	it('can rehydrate a valid session UUID', () => {
		const uuid = assertIsStableId('44f95a8b-c52b-4828-a000-0000f0000003');
		const sessionUuid = numericUuidFromStableId(uuid);
		expect(stableIdFromNumericUuid(sessionUuid)).to.equal(uuid);
	});

	it('can create valid session UUIDs', () => {
		for (let i = 0; i < 100; i++) {
			const sessionId = createSessionId();
			expect(sessionId.length).to.equal(36);
			expect(() => {
				const sessionNumericUuid = numericUuidFromStableId(sessionId);
				expect(stableIdFromNumericUuid(sessionNumericUuid)).to.equal(sessionId);
			}).to.not.throw();
		}
	});

	const maxUuidBigint = bigIntFromStableId(maxStableId);

	it('ensures that session UUIDs are resistant to overflow', () => {
		const uuid = assertIsStableId('ffffffff-ffff-4fff-bfff-ffffffffffff');
		for (let i = 0; i < 128; i++) {
			const ensuredUuid = ensureSessionUuid(uuid);
			expect(isStableId(ensuredUuid)).to.be.true;
			const ensuredBigint = bigIntFromStableId(ensuredUuid);
			expect(maxUuidBigint - ensuredBigint > Number.MAX_SAFE_INTEGER).to.be.true;
		}
	});

	it('correctly adjusts session UUIDs that are in danger of overflow', () => {
		const dangerous = [
			assertIsStableId('ffffffff-ffff-4fff-bfff-ffffffffffff'),
			assertIsStableId('ffffffff-ffff-4fff-bff0-000000000000'),
			assertIsStableId('ffffffff-ffff-4fff-bf00-000000000000'),
		];

		const safe = [
			assertIsStableId('ffffffff-ffff-4fff-beff-ffffffffffff'),
			assertIsStableId('ffffffff-ffff-4fff-bef0-000000000000'),
			assertIsStableId('ffffffff-ffff-4fff-be00-000000000000'),
		];

		dangerous.forEach((stableId) => expect(ensureSessionUuid(stableId)).to.not.equal(stableId));
		safe.forEach((stableId) => expect(ensureSessionUuid(stableId)).to.equal(stableId));
	});

	const stableIds = [
		assertIsStableId('748540ca-b7c5-4c99-83ff-c1b8e02c09d6'),
		assertIsStableId('748540ca-b7c5-4c99-83ef-c1b8e02c09d6'),
		assertIsStableId('748540ca-b7c5-4c99-831f-c1b8e02c09d6'),
		assertIsStableId('0002c79e-b536-4776-b000-000266c252d5'),
		assertIsStableId('082533b9-6d05-4068-a008-fe2cc43543f7'),
		assertIsStableId('2c9fa1f8-48d5-4554-a466-000000000000'),
		assertIsStableId('2c9fa1f8-48d5-4000-a000-000000000000'),
		assertIsStableId('10000000-0000-4000-b000-000000000000'),
		assertIsStableId('10000000-0000-4000-b020-000000000000'), // 2^52
		assertIsStableId('10000000-0000-4000-b00f-ffffffffffff'),
		assertIsStableId('10000000-0000-4000-b040-000000000000'),
		assertIsStableId('f0000000-0000-4000-8000-000000000000'),
		assertIsStableId('efffffff-ffff-4fff-bfff-ffffffffffff'),
		integerToStableId(0),
		integerToStableId(1),
		integerToStableId(77),
		integerToStableId(1024),
		integerToStableId(2 ** 32 - 1),
		integerToStableId(2 ** 52 - 1),
		integerToStableId(Number.MAX_SAFE_INTEGER),
		integerToStableId(Number.MAX_SAFE_INTEGER - 1),
	];

	describe('incrementing', () => {
		const rand = makeRandom(0);
		const incrementAmounts = [
			...[...new Array(53).keys()].map((n) => 2 ** n - 1),
			...[...new Array(10).keys()].map((_) => rand.integer(0, Number.MAX_SAFE_INTEGER)),
		];
		stableIds.forEach((stableId) => {
			it(`can increment ${stableId}`, () => {
				const uuid = numericUuidFromStableId(stableId);

				incrementAmounts.forEach((incrementAmount) => {
					const bigintIncremented = bigIntFromStableId(stableId) + BigInt(incrementAmount);
					const incremented = incrementUuid(uuid, incrementAmount);
					const bigintStr = integerToStableId(bigintIncremented);
					expect(stableIdFromNumericUuid(incremented)).to.equal(bigintStr);
				});
			});
		});
	});

	it('delta calculation can calculate the integer delta between stable ids', () => {
		stableIds.forEach((stableIdA) => {
			const uuidA = numericUuidFromStableId(stableIdA);
			const bigintA = bigIntFromStableId(stableIdA);
			const arbitraryMaxDelta = 2 ** 32 - 1;
			stableIds.forEach((stableIdB) => {
				const uuidB = numericUuidFromStableId(stableIdB);
				const bigintB = bigIntFromStableId(stableIdB);
				const realDelta = bigintA - bigintB;
				const numericDelta = getPositiveDelta(uuidA, uuidB, Number.MAX_SAFE_INTEGER);
				if (realDelta > Number.MAX_SAFE_INTEGER || realDelta < 0) {
					expect(numericDelta).to.equal(undefined);
				} else {
					expect(numericDelta).to.equal(Number(realDelta));
				}
				const numericDeltaCapped = getPositiveDelta(uuidA, uuidB, arbitraryMaxDelta);
				if (realDelta >= 0 && realDelta <= arbitraryMaxDelta) {
					expect(numericDeltaCapped).to.equal(Number(realDelta));
				} else {
					expect(numericDeltaCapped).to.equal(undefined);
				}
			});
		});
	});

	it('can round trip between stable ID and uuid', () => {
		stableIds.forEach((stableId) => {
			const uuid = numericUuidFromStableId(stableId);
			const roundTripped = stableIdFromNumericUuid(uuid);
			expect(stableId).to.equal(roundTripped);
		});
	});

	it('can compare numeric uuids', () => {
		stableIds.forEach((stableIdA) => {
			stableIds.forEach((stableIdB) => {
				const numericA = numericUuidFromStableId(stableIdA);
				const numericB = numericUuidFromStableId(stableIdB);
				const comparedNumeric = numericUuidEquals(numericA, numericB);
				const comparedStrings = compareStrings(stableIdA, stableIdB);
				expect(comparedNumeric).to.equal(comparedStrings === 0);
			});
		});
	});
});

function bigIntFromStableId(id: StableId): bigint {
	const minimized = id.replace(/-/g, '');
	//      UUID | xxxxxxxx-xxxx-Vxxx-vxxx-xxxxxxxxxxxx | The StableId passed to this function, shown here in standard UUID notation
	//   nibbles | hhhhhhhh hhhh  mmm llll llllllllllll | Whether or not each nibble is part of the "high", "middle" or "low" group below
	// bit count | 44444444-4444-0444-2444-444444444444 | The number of bits per nibble that are used to encode the number

	// Interpret numerically...
	const highNibbles = BigInt(`0x${minimized.substr(0, 12)}`); // ...all nibbles above the version nibble,
	const midNibbles = BigInt(`0x${minimized.substr(13, 3)}`); //  the nibbles below the version nibble and above the variant nibble,
	const lowNibbles = BigInt(`0x${minimized.substr(16, 16)}`); // and the variant nibble and all nibbles below
	// Count the number of bits that contribute to the number (i.e. are not reserved for version/variant) in...
	const lowBitCount = BigInt(62); // ...the low nibbles
	const midBitCount = BigInt(12); // and the mid nibbles
	// Shift the values of each region by the appropriate number of bits
	const highNumber = highNibbles << (midBitCount + lowBitCount);
	const midNumber = midNibbles << lowBitCount;
	// The low nibbles include the variant nibble because its two low bits are numerical (but its two upper bits are not). So mask them out:
	const lowNumber = lowNibbles & BigInt('0x3fffffffffffffff'); // A nibble '0011' followed by 15 nibbles '1111'.
	// Now that high and mid are shifted correctly, the final number is their sum:
	return highNumber + midNumber + lowNumber;
}
