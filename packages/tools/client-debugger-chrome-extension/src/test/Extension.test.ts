/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as chrome from "sinon-chrome";

/**
 * Tests end-to-end functionality of the extension.
 */

describe("Debugger Browser Extension tests", () => {
	beforeEach(async () => {});

	afterEach(async () => {
		chrome.flush();
	});

	it("Debugger only appears after being activated", () => {
		// Verify the debugger is not visible
		// Simulate click of extension button
		// Verify debugger is visible
		// Simulate click of extension button
		// Verify debugger is not visible
		expect(true).toBe(true); // TODO
	});
});
