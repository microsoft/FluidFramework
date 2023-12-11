/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionSpaceNormalizer } from "../sessionSpaceNormalizer";
import { makeLocalId } from "./testCommon";

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
});
