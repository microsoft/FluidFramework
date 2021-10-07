/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { expect } from 'chai';
import Prando from 'prando';
import { StableId, UuidString } from '../Identifiers';
import { assertNotUndefined, fail } from '../Common';
import {
	numericUuidEquals,
	createSessionUuid,
	getPositiveDelta,
	incrementUuid,
	numericUuidFromUuidString,
	stableIdFromNumericUuid,
	minimizeUuidString,
	expandUuidString,
	ensureSessionUuid,
} from '../id-compressor/NumericUuid';
import { compareStrings } from '../TreeViewUtilities';
import { integerToStableId } from './utilities/IdCompressorTestUtilities';

describe('NumericUuid', () => {
	it('can detect non-v4 variant 2 uuids', () => {
		expect(numericUuidFromUuidString('00000000000000000000000000000000' as StableId)).to.be.undefined;
		expect(numericUuidFromUuidString('ffffffffffffffffffffffffffffffff' as StableId)).to.be.undefined;
		expect(numericUuidFromUuidString('8e8fec9a10ea4d158308ed35bc7f1e66' as StableId)).to.not.be.undefined;
		[...new Array(16).keys()]
			.map((n) => [n, n.toString(16)])
			.forEach(([n, char]) => {
				const expectUuidVersion = expect(
					numericUuidFromUuidString(`000000000000${char}000b000000000000000` as StableId)
				);
				if (char === '4') {
					expectUuidVersion.to.not.be.undefined;
				} else {
					expectUuidVersion.to.be.undefined;
				}

				const expectUuidVariant = expect(
					numericUuidFromUuidString(`0000000000004000${char}000000000000000` as StableId)
				);
				if (n >= 8 && n <= 11) {
					expectUuidVariant.to.not.be.undefined;
				} else {
					expectUuidVariant.to.be.undefined;
				}
			});
	});

	const maxStableId = 'ffffffffffff4fffbfffffffffffffff' as StableId;

	it('detects increment overflow', () => {
		const uuid = assertNotUndefined(numericUuidFromUuidString(maxStableId));
		expect(() => stableIdFromNumericUuid(uuid, 1)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, 1))).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(uuid, 256)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, 256))).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(uuid, Number.MAX_SAFE_INTEGER)).to.throw('Exceeded maximum numeric UUID');
		expect(() => stableIdFromNumericUuid(incrementUuid(uuid, Number.MAX_SAFE_INTEGER))).to.throw(
			'Exceeded maximum numeric UUID'
		);
	});

	it('can rehydrate a valid session uuid', () => {
		const uuid = '44f95a8bc52b4828a0000000f0000003' as StableId;
		const sessionUuid = numericUuidFromUuidString(uuid);
		if (sessionUuid === undefined) {
			expect.fail('session uuid failed to be created');
		}
		expect(stableIdFromNumericUuid(sessionUuid)).to.equal(uuid);
	});

	it('can create valid session uuids', () => {
		for (let i = 0; i < 100; i++) {
			const sessionId = createSessionUuid();
			expect(sessionId.length).to.equal(32);
			expect(() => {
				const sessionNumericUuid = numericUuidFromUuidString(sessionId);
				if (sessionNumericUuid === undefined) {
					expect.fail('session uuid failed to be created');
				}
				expect(stableIdFromNumericUuid(sessionNumericUuid)).to.equal(sessionId);
			}).to.not.throw();
		}
	});

	const maxUuidBigint = bigIntFromStableId(maxStableId);

	it('ensures that session uuids are resistant to overflow', () => {
		const uuid = 'ffffffffffff4fffbfffffffffffffff' as StableId;
		for (let i = 0; i < 100; i++) {
			const ensuredUuid = ensureSessionUuid(uuid);
			const ensuredBigint = bigIntFromStableId(ensuredUuid);
			expect(maxUuidBigint - ensuredBigint > Number.MAX_SAFE_INTEGER).to.be.true;
		}
	});

	const stableIds = [
		'748540cab7c54c9983ffc1b8e02c09d6' as StableId,
		'0002c79eb5364776b000000266c252d5' as StableId,
		'082533b96d054068a008fe2cc43543f7' as StableId,
		'2c9fa1f848d54554a466000000000000' as StableId,
		'2c9fa1f848d54000a000000000000000' as StableId,
		'1000000000004000b000000000000000' as StableId,
		'1000000000004000b020000000000000' as StableId, // 2^52
		'1000000000004000b00fffffffffffff' as StableId,
		integerToStableId(0),
		integerToStableId(1),
		integerToStableId(77),
		integerToStableId(1024),
		integerToStableId(2 ** 32 - 1),
		integerToStableId(2 ** 52 - 1),
		integerToStableId(Number.MAX_SAFE_INTEGER), // 1fff...ffff
		integerToStableId(Number.MAX_SAFE_INTEGER - 1), // 1fff...fffe
	];

	describe('incrementing', () => {
		const prando = new Prando('incrementing');
		const incrementAmounts = [
			...[...new Array(53).keys()].map((n) => 2 ** n - 1),
			...[...new Array(10).keys()].map((_) => prando.nextInt(0, Number.MAX_SAFE_INTEGER)),
		];
		stableIds.forEach((stableId) => {
			it(`can increment ${stableId}`, () => {
				const uuid = numericUuidFromUuidString(stableId) ?? fail('Not a v4 uuid.');

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
			const uuidA = numericUuidFromUuidString(stableIdA) ?? fail('Not a v4 uuid.');
			const bigintA = bigIntFromStableId(stableIdA);
			const arbitraryMaxDelta = 2 ** 32 - 1;
			stableIds.forEach((stableIdB) => {
				const uuidB = numericUuidFromUuidString(stableIdB) ?? fail('Not a v4 uuid.');
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

	it('can minimize and expand uuid strings', () => {
		const withSep = '3dbfc668-7f10-4c18-8f78-109ed0dd5982' as UuidString;
		const withoutSep = '3dbfc6687f104c188f78109ed0dd5982' as StableId;
		expect(minimizeUuidString(withSep)).to.equal(withoutSep);
		expect(expandUuidString(withoutSep)).to.equal(withSep);
	});

	it('can round trip between stable ID and uuid', () => {
		stableIds.forEach((stableId) => {
			const uuid = numericUuidFromUuidString(stableId) ?? fail('Not a v4 uuid.');
			const roundTripped = stableIdFromNumericUuid(uuid);
			expect(stableId).to.equal(roundTripped);
		});
	});

	it('can compare numeric uuids', () => {
		stableIds.forEach((stableIdA) => {
			stableIds.forEach((stableIdB) => {
				const numericA = numericUuidFromUuidString(stableIdA) ?? fail('Not a v4 uuid.');
				const numericB = numericUuidFromUuidString(stableIdB) ?? fail('Not a v4 uuid.');
				const comparedNumeric = numericUuidEquals(numericA, numericB);
				const comparedStrings = compareStrings(stableIdA, stableIdB);
				expect(comparedNumeric).to.equal(comparedStrings === 0);
			});
		});
	});
});

function bigIntFromStableId(id: StableId): bigint {
	return (
		(BigInt(`0x${id.substr(0, 12)}`) << BigInt(74)) +
		(BigInt(`0x${id.substr(13, 3)}`) << BigInt(62)) +
		(BigInt(`0x${id.substr(16, 16)}`) & BigInt(`0x3fffffffffffffff`))
	);
}
