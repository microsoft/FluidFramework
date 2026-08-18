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
	testMatch: ["<rootDir>/test/**/*.spec.ts"],
	testPathIgnorePatterns: ["/node_modules/", "dist", "lib"],
	transform: {
		"^.+\\.spec.ts$": [
			"ts-jest",
			{
				tsconfig: "test/tsconfig.json",
			},
		],
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
};
