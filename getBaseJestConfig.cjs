/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Get a common configuration to run Jest tests in the FluidFramework repository.
 * @param {string} packageName Name of the package that is requesting the base jest configuration.
 * @returns A Promise that resolves to a Jest configuration object.
 */
function getBaseJestConfig(packageName) {
		// Get the test port from the global map and set it in env for this test
		let mappedPort = 9000; // Default port test-tools would provide if no mapping exists
		// Only import test-tools if FLUID_POLICY_CHECK is not set.
		// This allows us to run policy checks on the jest config files without having to build the repo.
		if (process.env.FLUID_POLICY_CHECK === undefined) {
			const { getTestPort } = require("@fluid-private/test-tools");
			mappedPort = getTestPort(packageName);
		}
		process.env.PORT = mappedPort;

		return {
			preset: "jest-puppeteer",
			globals: {
				PATH: `http://localhost:${mappedPort}`,
			},
			testMatch: ["**/?(*.)+(spec|test).[t]s"],
			testPathIgnorePatterns: ["/node_modules/", "dist", "lib"],
			transform: {
				"^.+\\.ts?$": "ts-jest",
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
			// While we still have transitive dependencies on 'uuid<9.0.0', force the CJS entry point:
			// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
			moduleNameMapper: { "^uuid$": "uuid" },
		};
}

module.exports = getBaseJestConfig;
