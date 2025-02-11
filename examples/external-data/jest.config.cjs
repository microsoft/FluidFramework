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
	globals: {
		PATH: `http://localhost:${mappedPort}`,
	},
	testMatch: ["**/?(*.)+(spec|test).[t]s"],
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	transform: {
		"^.+\\.ts?$": "ts-jest",
	},
	moduleNameMapper: {
		// Remove explicit .js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.js$": "$1",
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
	testTimeout: 10000,
};
