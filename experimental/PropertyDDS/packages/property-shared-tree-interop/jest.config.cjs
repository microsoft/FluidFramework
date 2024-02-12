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
		"^.+\\.ts$": [
			"ts-jest",
			{
				tsconfig: "src/test/tsconfig.json",
			},
		],
	},
	testPathIgnorePatterns: ["/node_modules/", "dist"],
	// While we still have transitive dependencies on 'uuid<9.0.0', force the CJS entry point:
	// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
	moduleNameMapper: {
		"^uuid$": "uuid",
		// Jest (v29) default module resolution has trouble resolving files ESM modules with a '*.js' extension.
		// The popular workaround is to remove the *.js or *.jsx extension for imports that begin with "./*" and "../*".
		// (See: https://github.com/kulshekhar/ts-jest/issues/1057)
		"^(\\.\\.?\\/.+)\\.jsx?$": "$1",
	},
};
