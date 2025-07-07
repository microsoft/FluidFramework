/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SessionSpaceNormalizer } from "../sessionSpaceNormalizer.js";

import { makeLocalId } from "./testCommon.js";

describe("SessionSpaceNormalizer", () => {
	it("can be empty", () => {
		const normalizer = new SessionSpaceNormalizer();
		assert.equal(normalizer.contains(makeLocalId(-1)), false);
	});

	it("can answer queries with a single range", () => {
		const normalizer = new SessionSpaceNormalizer();
		normalizer.addLocalRange(1, 5);
		assert.equal(normalizer.contains(makeLocalId(-1)), true);
		assert.equal(normalizer.contains(makeLocalId(-2)), true);
	});

	it("can answer queries with discontiguous ranges", () => {
		const normalizer = new SessionSpaceNormalizer();
		normalizer.addLocalRange(1, 2);
		normalizer.addLocalRange(6, 4);
		normalizer.addLocalRange(15, 1);
		assert.equal(normalizer.contains(makeLocalId(-11)), false);
		assert.equal(normalizer.contains(makeLocalId(-3)), false);
		assert.equal(normalizer.contains(makeLocalId(-7)), true);
	});

	it("can answer queries with contiguous ranges", () => {
		const normalizer = new SessionSpaceNormalizer();
		normalizer.addLocalRange(1, 2);
		normalizer.addLocalRange(3, 4);
		normalizer.addLocalRange(15, 1);
		normalizer.addLocalRange(16, 2);
		assert.equal(normalizer.contains(makeLocalId(-1)), true);
		assert.equal(normalizer.contains(makeLocalId(-4)), true);
		assert.equal(normalizer.contains(makeLocalId(-6)), true);
		assert.equal(normalizer.contains(makeLocalId(-7)), false);
		assert.equal(normalizer.contains(makeLocalId(-8)), false);
		assert.equal(normalizer.contains(makeLocalId(-15)), true);
		assert.equal(normalizer.contains(makeLocalId(-17)), true);
	});

	it("can compute the ranges between a query", () => {
		const normalizer = new SessionSpaceNormalizer();

		assert.deepEqual(normalizer.getRangesBetween(1, 10), []);

		normalizer.addLocalRange(2, 1);
		normalizer.addLocalRange(4, 3);
		normalizer.addLocalRange(9, 1);

		assert.deepEqual(normalizer.getRangesBetween(1, 10), [
			[2, 1],
			[4, 3],
			[9, 1],
		]);

		assert.deepEqual(normalizer.getRangesBetween(2, 9), [
			[2, 1],
			[4, 3],
			[9, 1],
		]);

		assert.deepEqual(normalizer.getRangesBetween(3, 9), [
			[4, 3],
			[9, 1],
		]);

		assert.deepEqual(normalizer.getRangesBetween(3, 8), [[4, 3]]);

		assert.deepEqual(normalizer.getRangesBetween(5, 9), [
			[5, 2],
			[9, 1],
		]);

		assert.deepEqual(normalizer.getRangesBetween(1, 5), [
			[2, 1],
			[4, 2],
		]);

		assert.deepEqual(normalizer.getRangesBetween(4, 4), [[4, 1]]);
		assert.deepEqual(normalizer.getRangesBetween(5, 5), [[5, 1]]);
		assert.deepEqual(normalizer.getRangesBetween(6, 6), [[6, 1]]);

		assert.deepEqual(normalizer.getRangesBetween(3, 3), []);
	});
});
