/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { forEachContiguousBunch } from "../bunching.js";

describe("forEachContiguousBunch", () => {
	it("emits nothing for an empty iterable", () => {
		const bunches: { key: string; bunch: number[] }[] = [];
		forEachContiguousBunch<{ k: string; v: number }, string, number>(
			[],
			(i) => i.k,
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
		);
		assert.deepStrictEqual(bunches, []);
	});

	it("emits a single bunch for a single item", () => {
		const bunches: { key: string; bunch: number[] }[] = [];
		forEachContiguousBunch(
			[{ k: "a", v: 1 }],
			(i) => i.k,
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
		);
		assert.deepStrictEqual(bunches, [{ key: "a", bunch: [1] }]);
	});

	it("collapses contiguous same-key items into one bunch", () => {
		const bunches: { key: string; bunch: number[] }[] = [];
		forEachContiguousBunch(
			[
				{ k: "a", v: 1 },
				{ k: "a", v: 2 },
				{ k: "a", v: 3 },
			],
			(i) => i.k,
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
		);
		assert.deepStrictEqual(bunches, [{ key: "a", bunch: [1, 2, 3] }]);
	});

	it("splits when the key changes and preserves order", () => {
		const bunches: { key: string; bunch: number[] }[] = [];
		forEachContiguousBunch(
			[
				{ k: "a", v: 1 },
				{ k: "a", v: 2 },
				{ k: "b", v: 3 },
				{ k: "a", v: 4 },
				{ k: "a", v: 5 },
			],
			(i) => i.k,
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
		);
		assert.deepStrictEqual(bunches, [
			{ key: "a", bunch: [1, 2] },
			{ key: "b", bunch: [3] },
			{ key: "a", bunch: [4, 5] },
		]);
	});

	it("alternating keys produce singleton bunches", () => {
		const bunches: { key: string; bunch: number[] }[] = [];
		forEachContiguousBunch(
			[
				{ k: "a", v: 1 },
				{ k: "b", v: 2 },
				{ k: "a", v: 3 },
				{ k: "b", v: 4 },
			],
			(i) => i.k,
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
		);
		assert.deepStrictEqual(bunches, [
			{ key: "a", bunch: [1] },
			{ key: "b", bunch: [2] },
			{ key: "a", bunch: [3] },
			{ key: "b", bunch: [4] },
		]);
	});

	it("uses a structured-key equality predicate when provided", () => {
		const bunches: { key: { x: string; y: string }; bunch: number[] }[] = [];
		forEachContiguousBunch(
			[
				{ x: "a", y: "1", v: 10 },
				{ x: "a", y: "1", v: 11 },
				{ x: "a", y: "2", v: 12 },
				{ x: "a", y: "2", v: 13 },
				{ x: "a", y: "1", v: 14 },
			],
			(i) => ({ x: i.x, y: i.y }),
			(i) => i.v,
			(key, bunch) => bunches.push({ key, bunch }),
			(a, b) => a.x === b.x && a.y === b.y,
		);
		assert.deepStrictEqual(bunches, [
			{ key: { x: "a", y: "1" }, bunch: [10, 11] },
			{ key: { x: "a", y: "2" }, bunch: [12, 13] },
			{ key: { x: "a", y: "1" }, bunch: [14] },
		]);
	});

	it("treats every item as a distinct key with reference-equality on object keys", () => {
		// Default keysEqual is Object.is — two distinct object instances never match,
		// so each item becomes its own bunch even when the keys are structurally identical.
		const bunches: number[][] = [];
		forEachContiguousBunch(
			[
				{ k: { a: 1 }, v: 1 },
				{ k: { a: 1 }, v: 2 },
			],
			(i) => i.k,
			(i) => i.v,
			(_key, bunch) => bunches.push(bunch),
		);
		assert.deepStrictEqual(bunches, [[1], [2]]);
	});

	it("supports valueOf that transforms items", () => {
		const bunches: string[][] = [];
		forEachContiguousBunch(
			[
				{ k: "a", v: 1 },
				{ k: "a", v: 2 },
				{ k: "b", v: 3 },
			],
			(i) => i.k,
			(i) => `v${i.v}`,
			(_key, bunch) => bunches.push(bunch),
		);
		assert.deepStrictEqual(bunches, [["v1", "v2"], ["v3"]]);
	});
});
