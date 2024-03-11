/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
	roots: ["<rootDir>"],
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
	transform: {
		"^.+\\.tsx?$": "ts-jest",
		"^.+\\.jsx?$": "babel-jest",
	},
	testMatch: ["**/dist/test/?(*.)+(spec|test).*js"],
	testPathIgnorePatterns: ["/node_modules/"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	testEnvironment: "jsdom",
};
