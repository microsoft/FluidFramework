/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Get the test port from the global map and set it in env for this test
let mappedPort = 9000; // Defaul port test-tools would provide if no mapping exists
// Only import test-tools if POLICY_CHECK is not set.
// This allows us to run policy checks on the jest config files without having to build the repo.
if (process.env.POLICY_CHECK === undefined) {
	/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment */
	const testTools = require("@fluid-private/test-tools");
	const { name } = require("./package.json");
	mappedPort = testTools.getTestPort(name);
	/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment */
}
process.env.PORT = mappedPort;

module.exports = {
	preset: "jest-puppeteer",
	globals: {
		PATH: `http://localhost:${mappedPort}`,
	},
	testMatch: ["**/e2e-tests/?(*.)+(spec|test).[t]s"],
	testPathIgnorePatterns: ["/node_modules/", "dist", "lib"],
	transform: {
		"^.+\\.test.ts?$": [
			"ts-jest",
			{
				tsconfig: "e2e-tests/tsconfig.json",
			},
		],
	},
	// While we still have transitive dependencies on 'uuid<9.0.0', force the CJS entry point:
	// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
	moduleNameMapper: { "^uuid$": "uuid" },
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
