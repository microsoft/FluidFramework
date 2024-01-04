/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	roots: ["<rootDir>/dist"],
	testEnvironment: "jsdom",
	testMatch: ["**/?(*.)+(spec|test).*js"],
	testPathIgnorePatterns: ["/node_modules/"],
	verbose: true,
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
};
