/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { assertNotUndefined } from '../Common';
import { AppendOnlyDoublySortedMap, AppendOnlySortedMap } from '../id-compressor/AppendOnlySortedMap';
import { compareFiniteNumbers } from '../TreeViewUtilities';

function runAppendOnlyMapTests(mapBuilder: () => AppendOnlySortedMap<number, number>) {
	it('detects out-of-order keys', () => {
		const map = mapBuilder();
		map.append(0, 0);
		const exception = 'Inserted key must be >= all others in the map.';
		expect(() => map.append(-1, 0)).to.throw(exception);
		expect(() => map.append(0, 0)).to.not.throw();
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
			for (let i = 1; i < elementCount; i++) {
				expect(map.getPairOrNextLower(i * 2)).to.deep.equal([i * 2, i * 2]);
				expect(map.getPairOrNextLower(i * 2 + 1)).to.deep.equal([i * 2, i * 2]);
			}
			const maxKey = assertNotUndefined(map.maxKey());
			expect(map.getPairOrNextLower(maxKey + 1)).to.deep.equal([maxKey, maxKey]);
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
		const exception = 'Inserted value must be >= all others in the map.';
		expect(() => map.append(1, -1)).to.throw(exception);
		expect(() => map.append(2, 0)).to.not.throw();
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
});
