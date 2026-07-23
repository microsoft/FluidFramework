/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { clamp } from "@fluidframework/core-utils/internal";

describe("clamp()", () => {
	const tests: { value: number; min: number; max: number; expected: number }[] = [
		// Within range: returned unchanged.
		{ value: 5, min: 0, max: 10, expected: 5 },
		{ value: 0, min: 0, max: 10, expected: 0 },
		{ value: 10, min: 0, max: 10, expected: 10 },
		// Below min: clamped up to min.
		{ value: -1, min: 0, max: 10, expected: 0 },
		{ value: -100, min: -10, max: 10, expected: -10 },
		// Above max: clamped down to max.
		{ value: 11, min: 0, max: 10, expected: 10 },
		{ value: 100, min: -10, max: 10, expected: 10 },
		// Degenerate range where min === max.
		{ value: 5, min: 3, max: 3, expected: 3 },
	];

	for (const { value, min, max, expected } of tests) {
		it(`clamp(${value}, ${min}, ${max}) === ${expected}`, () => {
			assert.equal(clamp(value, min, max), expected);
		});
	}
});
