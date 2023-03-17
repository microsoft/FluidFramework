/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Get the test port from the global map and set it in env for this test
const testTools = require("@fluidframework/test-tools");
const { name } = require("./package.json");

mappedPort = testTools.getTestPort(name);
process.env["PORT"] = mappedPort;

module.exports = {
	preset: "jest-puppeteer",
	globals: {
		PATHS: [
			`http://localhost:${mappedPort}`,
			`http://localhost:${Number.parseInt(mappedPort) + 1}`,
		],
	},
	testMatch: ["**/?(*.)+(spec|test).[t]s"],
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	transform: {
		"^.+\\.ts?$": "ts-jest",
	},
};
