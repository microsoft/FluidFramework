/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	roots: ["<rootDir>/src"],
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
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: "src/test/tsconfig.cjs.json",
			},
		],
		"^.+\\.cts$": [
			"ts-jest",
			{
				tsconfig: "src/test/tsconfig.cjs.json",
			},
		],
	},
	testRegex: "src/test/.*.test\\.tsx?$",
	// testRegex: "/dist/test/(.*|(\\.|/)(test|spec))\\.(js|jsx)?$",
	// testMatch: ["**/?dist/?test/?(*.)+(spec|test).*s?(x)"],
	testPathIgnorePatterns: ["/node_modules/"],
	moduleNameMapper: {
		// Remove explicit .(c)js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.js$": "$1",
		// "^(\\.{1,2}/.*)\\.cjs$": "$1",
	},
	moduleFileExtensions: ["ts", "mts", "cts", "tsx", "js", "cjs", "mjs", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	testEnvironment: "jsdom",
};
