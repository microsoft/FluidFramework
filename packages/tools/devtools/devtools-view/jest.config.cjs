/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
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
		"^.+\\.c?tsx?$": [
			"ts-jest",
			{
				tsconfig: "src/test/tsconfig.json",
			},
		],
	},
	// This regex will match source (TypeScript) or transpiled (JavaScript) files.
	// Change `roots` to select between those.
	testRegex: "test/.*\\.test\\.[jt]sx?$",
	testPathIgnorePatterns: ["/node_modules/"],
	moduleNameMapper: {
		// Remove explicit .(c)js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.c?js$": "$1",
	},
	moduleFileExtensions: ["ts", "tsx", "cts", "mts", "js", "cjs", "mjs", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	testEnvironment: "jsdom",
};
