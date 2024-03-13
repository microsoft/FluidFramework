/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// jest.config.cjs
module.exports = {
	reporters: [
		"default",
		[
			"jest-junit",
			{
				outputDirectory: "nyc",
				outputName: "jest-junit-report.xml",
			},
		],
	],
	// The glob patterns Jest uses to detect test files
	// Test only CommonJS as test files (mostly .js) use only CommonJS patterns.
	testMatch: ["**/dist/test/*.spec.js"],

	testEnvironment: "jsdom",

	// An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
	testPathIgnorePatterns: ["/node_modules/"],

	// Force the CJS entry point for 'msgpackr'.  (Problem still present in msgpackr@1.9.7).
	// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
	moduleNameMapper: { "^msgpackr$": "msgpackr" },
};
