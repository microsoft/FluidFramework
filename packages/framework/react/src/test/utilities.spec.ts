/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { areSetsDisjoint } from "../utilities.js";

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
