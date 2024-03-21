/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "jest-puppeteer",
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
	// Only CJS is tested per use of `rewire` in gitHash.spec.ts.
	testMatch: ["**/dist/test/jest/?(*.)+(spec|test).*js"],
	testPathIgnorePatterns: ["/node_modules/"],
};
