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
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	globals: {
		PATH: `http://localhost:${mappedPort}`,
	},
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	preset: "ts-jest",
	roots: ["<rootDir>/src"],
	testMatch: ["**/?(*.)+(spec|test).[t]s"],
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	transform: {
		"^.+\\.tsx?$": "ts-jest",
	},
};
