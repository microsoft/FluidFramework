/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// jest.config.cjs
module.exports = {
	globals: {
		"ts-jest": {
			tsconfig: "<rootDir>/test/tsconfig.test.json",
		},
	},
	preset: "ts-jest",
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
	// The glob patterns Jest uses to detect test files
	testMatch: ["/**/test/*.spec.tsx"],

	testEnvironment: "jsdom",

	// An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
	testPathIgnorePatterns: ["/node_modules/", "dist"],

	// A map from regular expressions to paths to transformers
	transform: {
		"^.+\\.(t|j)sx?$": "ts-jest",
		"^.+\\.(jpg|jpeg|png|gif|svg|mp4)$": "jest-transform-file",
	},

	// A map from regular expressions to module names that allow to stub out resources with a single module
	moduleNameMapper: {
		// Remove explicit .js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.js$": "$1",
		// Mock CSS and LESS imports during test
		"\\.(css|less)$": "identity-obj-proxy",
		// Force module sinon to resolve with the CJS entry point, because Jest does not support package.json.exports. Somewhat similar issue: https://github.com/uuidjs/uuid/issues/451
		"^sinon$": "<rootDir>/node_modules/sinon/lib/sinon.js",
		// '\\.svg$': '<rootDir>/__mocks__/svgrMock.js'
	},

	// A list of paths to modules that run some code to configure or set up the testing framework before each test
	setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};
