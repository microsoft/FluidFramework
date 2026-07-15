/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { clamp } from "@fluidframework/core-utils/internal";

describe("clamp()", () => {
	const tests: [value: number, min: number, max: number, expected: number][] = [
		// Within range: returned unchanged.
		[5, 0, 10, 5],
		[0, 0, 10, 0],
		[10, 0, 10, 10],
		// Below min: clamped up to min.
		[-1, 0, 10, 0],
		[-100, -10, 10, -10],
		// Above max: clamped down to max.
		[11, 0, 10, 10],
		[100, -10, 10, 10],
		// Degenerate range where min === max.
		[5, 3, 3, 3],
	];

	for (const [value, min, max, expected] of tests) {
		it(`clamp(${value}, ${min}, ${max}) === ${expected}`, () => {
			assert.equal(clamp(value, min, max), expected);
		});
	}
});
