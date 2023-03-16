/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compareArrays } from "../compare";

const o = { o: "o" };
const s = Symbol("s");

const tests: [unknown[], unknown[], boolean][] = [
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

describe("compareArrays()", () => {
	function check<T>(left: T[], right: T[], expected: boolean): void {
		it(`${JSON.stringify(left)} and ${JSON.stringify(right)} must ${
			expected ? "" : "not "
		}be equal`, () => {
			const actual = compareArrays(left, right);

			assert.equal(actual, expected);
		});
	}

	for (const [left, right, expected] of tests) {
		check(left, right, expected);
	}
});
