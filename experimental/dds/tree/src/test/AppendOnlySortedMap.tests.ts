/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { expect } from 'chai';
import { assertNotUndefined, compareFiniteNumbers } from '../Common';
import { AppendOnlyDoublySortedMap, AppendOnlySortedMap } from '../id-compressor/AppendOnlySortedMap';

function runAppendOnlyMapTests(mapBuilder: () => AppendOnlySortedMap<number, number>) {
	it('detects out-of-order keys', () => {
		const map = mapBuilder();
		map.append(0, 0);
		const exception = 'Inserted key must be > all others in the map.';
		expect(() => map.append(-1, 1)).to.throw(exception);
		expect(() => map.append(1, 2)).to.not.throw();
	});

	it('can get the max key', () => {
		const map = mapBuilder();
		const elementCount = 10;
		expect(map.maxKey()).to.be.undefined;
		for (let i = 0; i < elementCount; i++) {
			map.append(i, i);
			expect(map.maxKey()).to.equal(i);
		}
	});

	it('can get values', () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			map.append(i, i);
		}
		expect(map.get(-1)).to.be.undefined;
		expect(map.get(10)).to.be.undefined;
		for (let i = 0; i < elementCount; i++) {
			expect(map.get(i)).to.equal(i);
		}
	});

	it('can get an entry or next lower by key', () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i * 2, i * 2);
			}
			expect(map.getPairOrNextLower(-1)).to.be.undefined;
			for (let i = 0; i < map.size; i++) {
				expect(map.getPairOrNextLower(i * 2)).to.deep.equal([i * 2, i * 2]);
				expect(map.getPairOrNextLower(i * 2 + 1)).to.deep.equal([i * 2, i * 2]);
			}
			const maxKey = assertNotUndefined(map.maxKey());
			expect(map.getPairOrNextLower(maxKey + 1)).to.deep.equal([maxKey, maxKey]);
		});
	});

	it('can get an entry or next higher by key', () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i * 2, i * 2);
			}
			const minKey = assertNotUndefined(map.minKey());
			expect(map.getPairOrNextHigher(minKey - 1)).to.deep.equal([minKey, minKey]);
			for (let i = 0; i < map.size - 1; i++) {
				expect(map.getPairOrNextHigher(i * 2)).to.deep.equal([i * 2, i * 2]);
				expect(map.getPairOrNextHigher(i * 2 + 1)).to.deep.equal([i * 2 + 2, i * 2 + 2]);
			}
			expect(map.getPairOrNextHigher(map.size * 2 + 1)).to.be.undefined;
		});
	});

	it('knows how big it is', () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			expect(map.size).to.equal(i);
			map.append(i, i);
		}
		expect(map.size).to.equal(elementCount);
	});

	it('can calculate the indexOf a search element', () => {
		const elements: [number, number][] = [
			[0, 0],
			[2, 0],
			[3, 0],
		];
		const comparator = (key: number, element: readonly [number, number]): number => {
			return compareFiniteNumbers(key, element[0]);
		};
		expect(AppendOnlySortedMap.indexOf(elements, 0, comparator)).to.equal(0);
		expect(AppendOnlySortedMap.indexOf(elements, 2, comparator)).to.equal(1);
		expect(AppendOnlySortedMap.indexOf(elements, 3, comparator)).to.equal(2);
		expect(AppendOnlySortedMap.indexOf(elements, -1, comparator)).to.equal(0 ^ AppendOnlySortedMap.failureXor);
		expect(AppendOnlySortedMap.indexOf(elements, 1, comparator)).to.equal(1 ^ AppendOnlySortedMap.failureXor);
		expect(AppendOnlySortedMap.indexOf(elements, 10, comparator)).to.equal(3 ^ AppendOnlySortedMap.failureXor);
	});

	describe('can perform range queries', () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			map.append(i * 2, i * 2);
		}
		const maxKey = assertNotUndefined(map.maxKey());

		it('on empty ranges', () => {
			expect([...map.getRange(1, -1)]).to.deep.equal([]);
			expect([...map.getRange(maxKey + 1, maxKey + 1)]).to.deep.equal([]);
		});

		it('on ranges of size 1', () => {
			expect([...map.getRange(0, 0)]).to.deep.equal([[0, 0]]);
			expect([...map.getRange(1, 1)]).to.deep.equal([]);
			expect([...map.getRange(-1, -1)]).to.deep.equal([]);
		});

		it('on non-empty ranges', () => {
			expect([...map.getRange(0, 1)]).to.deep.equal([[0, 0]]);
			expect([...map.getRange(0, 2)]).to.deep.equal([
				[0, 0],
				[2, 2],
			]);
			expect([...map.getRange(1, 5)]).to.deep.equal([
				[2, 2],
				[4, 4],
			]);
			const allEntries = [...map.entries()];
			expect([...map.getRange(0, maxKey)]).to.deep.equal(allEntries);
			expect([...map.getRange(-maxKey, maxKey)]).to.deep.equal(allEntries);
			expect([...map.getRange(0, 2 * maxKey)]).to.deep.equal(allEntries);
			expect([...map.getRange(-maxKey, 2 * maxKey)]).to.deep.equal(allEntries);
		});
	});
}

describe('AppendOnlySortedMap', () => {
	runAppendOnlyMapTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});

describe('AppendOnlyDoublySortedMap', () => {
	const mapBuilder = () =>
		new AppendOnlyDoublySortedMap<number, number, number>(
			compareFiniteNumbers,
			(value) => value,
			compareFiniteNumbers
		);
	runAppendOnlyMapTests(mapBuilder);

	it('detects out-of-order values', () => {
		const map = mapBuilder();
		map.append(0, 0);
		const exception = 'Inserted value must be > all others in the map.';
		expect(() => map.append(1, -1)).to.throw(exception);
		expect(() => map.append(2, 1)).to.not.throw();
	});

	it('can get an entry or next lower by value', () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i - elementCount, i * 2);
			}
			expect(map.getPairOrNextLowerByValue(-1)).to.be.undefined;
			for (let i = 1; i < elementCount; i++) {
				expect(map.getPairOrNextLowerByValue(i * 2)).to.deep.equal([i - elementCount, i * 2]);
				expect(map.getPairOrNextLowerByValue(i * 2 + 1)).to.deep.equal([i - elementCount, i * 2]);
			}
		});
	});

	it('can get an entry or next higher by value', () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i - elementCount, i * 2);
			}
			for (let i = 0; i < elementCount - 1; i++) {
				expect(map.getPairOrNextHigherByValue(i * 2)).to.deep.equal([i - elementCount, i * 2]);
				expect(map.getPairOrNextHigherByValue(i * 2 + 1)).to.deep.equal([i - elementCount + 1, i * 2 + 2]);
			}
			const maxValue = (elementCount - 1) * 2;
			expect(map.getPairOrNextHigherByValue(maxValue)).to.deep.equal([-1, maxValue]);
			expect(map.getPairOrNextHigherByValue(maxValue + 1)).to.be.undefined;
		});
	});
});
