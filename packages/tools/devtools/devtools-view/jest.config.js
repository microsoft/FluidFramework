/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
	roots: ["<rootDir>/src"],
	transform: {
		"^.+\\.tsx?$": "ts-jest",
	},
	testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(ts|tsx)?$",
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	coveragePathIgnorePatterns: ["/node_modules/", "/src/test/"],
	testEnvironment: "jsdom",
};
