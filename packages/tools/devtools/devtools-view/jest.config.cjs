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
	},
	moduleNameMapper: {
		// Force module sinon to resolve with the CJS entry point, because Jest does not support package.json.exports. Somewhat similar issue: https://github.com/uuidjs/uuid/issues/451
		"^react$": "<rootDir>/node_modules/react/lib/react.js",
	},
	testMatch: ["**/dist/test/?(*.)+(spec|test).*js"],
	testPathIgnorePatterns: ["/node_modules/", "node_modules/(?!react/.*)"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	testEnvironment: "jsdom",
};
