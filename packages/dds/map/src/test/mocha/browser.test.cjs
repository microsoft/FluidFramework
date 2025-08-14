/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
const { test, expect } = require("@playwright/test");

test("Mocha tests in browser", async ({ page }) => {
	// Navigate to the test page with headless parameter
	await page.goto("http://localhost:8080/?headless=true");

	// Wait for tests to complete (look for testResults to be set)
	await page.waitForFunction(
		() => {
			return window.testResults !== undefined;
		},
		{ timeout: 60000 },
	);

	// Get test results
	const testResults = await page.evaluate(() => {
		return window.testResults;
	});

	// Output the actual test results (this is what matters)
	console.log(
		`\nMocha Test Results: ${testResults.passes} passed, ${testResults.failures} failed, ${testResults.tests} total\n`,
	);

	// If there are failures, show detailed information
	if (testResults.failures > 0 && testResults.failureDetails) {
		console.log("🔴 Failed Tests:");
		for (const [index, failure] of testResults.failureDetails.entries()) {
			console.log(`\n${index + 1}. ${failure.fullTitle}`);
			console.log(`   Error: ${failure.error}`);
			if (failure.stack) {
				// Show first few lines of stack trace
				const stackLines = failure.stack.split("\n").slice(0, 3);
				console.log(`   Stack: ${stackLines.join("\n          ")}`);
			}
		}
		console.log();
	}

	// Assert that all tests passed
	expect(testResults.failures, `${testResults.failures} Mocha tests failed`).toBe(0);
	expect(testResults.passes, "No Mocha tests were executed").toBeGreaterThan(0);
});
