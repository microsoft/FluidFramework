/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

describe.only("My test suite", () => {
	beforeEach(() => {
		throw new Error("Fake error");
	});

	it("Test 1", () => {
		assert.equal(1, 1);
	});

	it("Test 2", () => {
		assert.equal(2, 2);
	});
});

describe.only("My second test suite", () => {
	function setup(): void {
		throw new Error("Fake error");
	}

	it("Test 1", () => {
		setup();
		assert.equal(1, 1);
	});

	it("Test 2", () => {
		setup();
		assert.equal(2, 2);
	});
});
