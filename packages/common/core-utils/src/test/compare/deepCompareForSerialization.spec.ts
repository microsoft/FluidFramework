/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compareJson } from "../../compare";

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
		[{ a: 1, b: 2, c: [3, 4] }, { a: 1, b: 2, c: [3, 4] }, true],
		[{ a: 1, b: 2, c: [3, 4] }, { a: 1, b: 2, c: [3, 5] }, false],
		[{ a: 1, b: 2, c: [3, 4] }, { a: 1, d: 2, c: [3, 4] }, false],
		[{ a: 1, b: 2, c: [3, 4] }, { a: 1, b: 2 }, false],
		[{ a: { x: 1 }, b: { y: [2] } }, { a: { x: 1 }, b: { y: [2] } }, true],
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
	];

	const allCases = [
		...arrayCases,
		...bingCases,
		...objectCases,
		...arrayCases,
		...nonObjectCases,
		...jsonEquivalenceClassCases,
	];
	for (const [left, right, expected] of allCases) {
		const [leftString, rightString] = [JSON.stringify(left), JSON.stringify(right)];
		it(`${leftString} and ${rightString} must ${expected ? "" : "not "}be equal`, () => {
			const actual = compareJson(leftString, rightString);
			assert.equal(actual, expected);
			const commuted = compareJson(rightString, leftString);
			assert.equal(commuted, expected);
		});
	}

	it("Acts like === for non-JSON inputs", () => {
		assert.equal(compareJson("hello", "hello"), true, "Matching non-JSON strings are ok");
		assert.equal(compareJson("hello", "world"), false, "Non-matching non-JSON strings not ok");
	});
});
