/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// jest.config.js
module.exports = {
	// The glob patterns Jest uses to detect test files
	testMatch: ["/**/dist/test/*.spec.js"],

	testEnvironment: "jsdom",

	// An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
	testPathIgnorePatterns: ["/node_modules/"],

	// Force the CJS entry point for 'msgpackr'.  (Problem still present in msgpackr@1.9.7).
	// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
	moduleNameMapper: { "^msgpackr$": "msgpackr" },
};
