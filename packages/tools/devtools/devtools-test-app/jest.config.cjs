/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Get the test port from the global map and set it in env for this test
const testTools = require("@fluidframework/test-tools");
const { name } = require("./package.json");

const mappedPort = testTools.getTestPort(name);
process.env["PORT"] = mappedPort;

module.exports = {
	preset: "jest-puppeteer",
	roots: ["<rootDir>/src"],
	globals: {
		PATH: `http://localhost:${mappedPort}`,
	},
	transform: {
		"^.+\\.ts?$": "ts-jest",
	},
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
	testTimeout: 30_000,
	testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.ts?$",
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
};
