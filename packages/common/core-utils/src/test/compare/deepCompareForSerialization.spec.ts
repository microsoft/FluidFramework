/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { deepCompareForSerialization } from "../../compare";

const o = { o: "o" };
const s = Symbol("s");

export const tests_old: [unknown, unknown, boolean][] = [
	[[], [], true],
	[[0], [], false],
	[[], [0], false],
	[[0], [0], true],
	[[1], [0], false],
	[[0], [1], false],

	[[0, 1], [0], false],
	[[0], [0, 1], false],
	[[0, 1], [0, 2], false],
	[[0, 1], [-1, 1], false],
	[[0, 1], [0, 1], true],

	// Object.is() semantics:
	[[Number.NaN], [Number.NaN], true],
	[[0], [-0], false],

	[[null], [undefined], false],
	[[""], [0], false],
	[[{}], [{}], false],
	[[o], [o], true],
	[[Symbol("sl")], [Symbol("sr")], false],
	[[s], [s], true],
];

describe("deepCompareObjectEntries", () => {
	const jsonEquivalenceClassCases: [any, any, boolean][] = [
		[-0, +0, true],
		[null, NaN, true],
		[[undefined], [null], true],
		[[1, undefined, 3], [1, null, 3], true],
	];

	const objectCases: [any, any, boolean][] = [
		[{}, {}, true],
		[null, {}, false],
		[null, null, true],
		[{ a: undefined }, {}, true],
		[{ a: undefined }, { a: undefined }, true],
		[{ a: 1 }, { a: 1 }, true],
		[{ a: 1 }, { a: 2 }, false],
		[{ a: 1 }, { b: 1 }, false],
		[{ a: { b: 1 } }, { a: { b: 1 } }, true],
		[{ a: { b: 1 } }, { a: { b: 2 } }, false],
		[{ a: undefined }, { a: null }, false],
		[{ a: null }, { a: null }, true],
		[{ a: 1, b: 2 }, { a: 1 }, false],
		[{ a: 1 }, { a: 1, b: 2 }, false],
	];

	const bingCases: [any, any, boolean][] = [
		[{ a: 1, b: 2 }, { a: 1, b: 2 }, true],
		[{ a: 1, b: 2 }, { a: 1, b: 3 }, false],
		[{ a: { c: 3 }, b: 2 }, { a: { c: 3 }, b: 2 }, true],
		[{ a: { c: 3 }, b: 2 }, { a: { c: 4 }, b: 2 }, false],
		[{ a: 1 }, { a: 1, b: 2 }, false],
		[{ a: { c: 3 } }, { a: { c: 3 }, b: 2 }, false],
	];

	const arrayCases: [any, any, boolean][] = [
		[[], [], true],
		[[], [0], false],
		[[0], [0], true],
		[[1], [0], false],
		[[1, 2, 3], [1, 2, 3], true],
		[[1, 2, 3], [1, 2, 4], false],
		[[1, 2, 3], [1, 2], false],
		[["one"], { "0": "one" }, true],
	];

	const nonObjectCases: [any, any, boolean][] = [
		[0, 0, true],
		["", "", true],
		[true, true, true],
		[undefined, undefined, true],
		[null, null, true],
		[null, undefined, false],
		[Symbol("s"), undefined, false],
	];

	function check(left: any, right: any, expected: boolean) {
		it(`${JSON.stringify(left)} and ${JSON.stringify(right)} must ${
			expected ? "" : "not "
		}be equal`, () => {
			const actual = deepCompareForSerialization(left, right);
			assert.equal(actual, expected);
			const commuted = deepCompareForSerialization(right, left);
			assert.equal(commuted, expected);
		});
	}

	const allCases = [
		...arrayCases,
		...bingCases,
		...objectCases,
		...arrayCases,
		...nonObjectCases,
		...jsonEquivalenceClassCases,
	];
	const debug: [any, any, boolean][] = [
		//
		[{ a: { b: 1 } }, { a: { b: 1 } }, true],
	];
	for (const [left, right, expected] of allCases) {
		check(left, right, expected);
	}
	//*
	return debug;
});
