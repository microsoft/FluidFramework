/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const MapWithExpiration = require("../../mapWithExpiration.js");

describe("forEach thisArg", () => {
	function testForEachCases(testName, testFn) {
		it(testName, () => {
			testFn(
				[new Map(), new MapWithExpiration(10)], 
				["THIS", undefined],
			);
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
