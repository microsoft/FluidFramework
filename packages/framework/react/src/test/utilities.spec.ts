/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { areSetsDisjoint, findLastIndex } from "../utilities.js";

describe("areSetsDisjoint", () => {
	it("returns true for two empty sets", () => {
		assert(areSetsDisjoint(new Set(), new Set()));
	});

	it("returns true when one set is empty", () => {
		assert(areSetsDisjoint(new Set(["a"]), new Set()));
		assert(areSetsDisjoint(new Set(), new Set(["a"])));
	});

	it("returns true for sets with no common elements", () => {
		assert(areSetsDisjoint(new Set(["a", "b"]), new Set(["c", "d"])));
	});

	it("returns false when sets share one element", () => {
		assert(!areSetsDisjoint(new Set(["a", "b"]), new Set(["b", "c"])));
	});

	it("returns false when one set is a subset of the other", () => {
		assert(!areSetsDisjoint(new Set(["a"]), new Set(["a", "b", "c"])));
		assert(!areSetsDisjoint(new Set(["a", "b", "c"]), new Set(["a"])));
	});

	it("returns false for identical sets", () => {
		assert(!areSetsDisjoint(new Set(["x"]), new Set(["x"])));
	});
});

describe("findLastIndex", () => {
	it("returns -1 for an empty array", () => {
		assert.equal(
			findLastIndex([], () => true),
			-1,
		);
	});

	it("returns -1 when no element matches", () => {
		assert.equal(
			findLastIndex([1, 2, 3], (x) => x > 10),
			-1,
		);
	});

	it("returns the index of the only matching element", () => {
		assert.equal(
			findLastIndex([1, 2, 3], (x) => x === 2),
			1,
		);
	});

	it("returns the last (highest) index when multiple elements match", () => {
		assert.equal(
			findLastIndex([1, 2, 1, 2], (x) => x === 1),
			2,
		);
	});

	it("returns the last index when the predicate matches all elements", () => {
		assert.equal(
			findLastIndex([5, 5, 5], () => true),
			2,
		);
	});

	it("returns 0 when only the first element matches", () => {
		assert.equal(
			findLastIndex([9, 1, 2], (x) => x === 9),
			0,
		);
	});
});
