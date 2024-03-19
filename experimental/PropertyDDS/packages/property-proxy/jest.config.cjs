/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
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
	testEnvironment: "node",
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	moduleNameMapper: {
		// Remove explicit .js from local paths to allow jest to find the .ts* files
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	globals: {
		"ts-jest": {
			tsconfig: "src/test/tsconfig.json",
		},
	},
	testPathIgnorePatterns: ["/node_modules/", "dist", "lib"],
};
