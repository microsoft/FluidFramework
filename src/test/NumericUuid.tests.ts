/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { expect } from 'chai';
import Prando from 'prando';
import { StableId } from '../Identifiers';
import { assert } from '../Common';
import {
	numericUuidEquals,
	createSessionId,
	getPositiveDelta,
	incrementUuid,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
	minimizeUuidString,
	expandUuidString,
	ensureSessionUuid,
	isStableId,
	assertIsStableId,
	isMinimalUuidString,
} from '../id-compressor/NumericUuid';
import { compareStrings } from '../TreeViewUtilities';
import { integerToStableId } from './utilities/IdCompressorTestUtilities';

describe('NumericUuid', () => {
	it('can detect non-v4 variant 2 uuids', () => {
		expect(isStableId(minimizeUuidString('00000000000000000000000000000000'))).to.be.false;
		expect(isStableId(minimizeUuidString('ffffffffffffffffffffffffffffffff'))).to.be.false;
		expect(isStableId(minimizeUuidString('8e8fec9a10ea4d158308ed35bc7f1e66'))).to.be.true;
		[...new Array(16).keys()]
			.map((n) => [n, n.toString(16)])
			.forEach(([n, char]) => {
				const expectUuidVersion = expect(
					isStableId(minimizeUuidString(`000000000000${char}000b000000000000000`))
				);
				if (char === '4') {
					expectUuidVersion.to.be.true;
				} else {
					expectUuidVersion.to.be.false;
				}

				const expectUuidVariant = expect(
					isStableId(minimizeUuidString(`0000000000004000${char}000000000000000`))
				);
				if (n >= 8 && n <= 11) {
					expectUuidVariant.to.be.true;
				} else {
					expectUuidVariant.to.be.false;
				}
			});
	});

	const maxStableId = assertIsStableId('ffffffffffff4fffbfffffffffffffff');

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

	it('can rehydrate a valid session uuid', () => {
		const uuid = assertIsStableId('44f95a8bc52b4828a0000000f0000003');
		const sessionUuid = numericUuidFromStableId(uuid);
		expect(stableIdFromNumericUuid(sessionUuid)).to.equal(uuid);
	});

	it('can create valid session uuids', () => {
		for (let i = 0; i < 100; i++) {
			const sessionId = createSessionId();
			expect(sessionId.length).to.equal(32);
			expect(() => {
				const sessionNumericUuid = numericUuidFromStableId(sessionId);
				expect(stableIdFromNumericUuid(sessionNumericUuid)).to.equal(sessionId);
			}).to.not.throw();
		}
	});

	const maxUuidBigint = bigIntFromStableId(maxStableId);

	it('ensures that session uuids are resistant to overflow', () => {
		const uuid = assertIsStableId('ffffffffffff4fffbfffffffffffffff');
		for (let i = 0; i < 100; i++) {
			const ensuredUuid = ensureSessionUuid(uuid);
			const ensuredBigint = bigIntFromStableId(ensuredUuid);
			expect(maxUuidBigint - ensuredBigint > Number.MAX_SAFE_INTEGER).to.be.true;
		}
	});

	const stableIds = [
		assertIsStableId('748540cab7c54c9983ffc1b8e02c09d6'),
		assertIsStableId('0002c79eb5364776b000000266c252d5'),
		assertIsStableId('082533b96d054068a008fe2cc43543f7'),
		assertIsStableId('2c9fa1f848d54554a466000000000000'),
		assertIsStableId('2c9fa1f848d54000a000000000000000'),
		assertIsStableId('1000000000004000b000000000000000'),
		assertIsStableId('1000000000004000b020000000000000'), // 2^52
		assertIsStableId('1000000000004000b00fffffffffffff'),
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

	it('can minimize and expand uuid strings', () => {
		const withSep = '3dbfc668-7f10-4c18-8f78-109ed0dd5982';
		const withoutSep = '3dbfc6687f104c188f78109ed0dd5982';
		assert(isMinimalUuidString(withoutSep));
		expect(minimizeUuidString(withSep)).to.equal(withoutSep);
		expect(expandUuidString(withoutSep)).to.equal(withSep);
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
	return (
		(BigInt(`0x${id.substr(0, 12)}`) << BigInt(74)) +
		(BigInt(`0x${id.substr(13, 3)}`) << BigInt(62)) +
		(BigInt(`0x${id.substr(16, 16)}`) & BigInt(`0x3fffffffffffffff`))
	);
}
