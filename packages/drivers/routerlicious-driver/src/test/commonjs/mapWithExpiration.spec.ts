/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This test runs against CJS modules, as the behavior of 'this' differs between CJS and ESM modules.
// Therefore, the test is moved here and excluded from testing with ESM modules. AB#7431
import { strict as assert } from "assert";
import { MapWithExpiration } from "../../mapWithExpiration.js";

describe("forEach thisArg", () => {
	function testForEachCases(testName, testFn) {
		it(testName, () => {
			testFn([new Map(), new MapWithExpiration(10)], ["THIS", undefined]);
		});
	}

	testForEachCases("Arrow functions don't pick up thisArg", (maps, thisArgs) => {
		for (const thisArg of thisArgs) {
			for (const map of maps) {
				map.set(1, "one");
				map.forEach(() => {
					assert.notEqual(this, thisArg, "Expected 'this' to be unchanged for arrow fn");
				}, thisArg);
			}
		}
	});
});
