/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	globals: {
		"ts-jest": {
			tsconfig: "src/test/tsconfig.json",
		},
	},
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	// While we still have transitive dependencies on 'uuid<9.0.0', force the CJS entry point:
	// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
	moduleNameMapper: { "^uuid$": "uuid" },
};
