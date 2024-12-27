/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Note: this is require()d from jest.config.cjs files across the repo
 * so it needs to remain a CJS file until Jest supports ESM.
 */

/**
 * Get a common configuration to run Jest tests in the FluidFramework repository.
 * @param {string} packageName Name of the package that is requesting the base jest configuration.
 * @returns A Promise that resolves to a Jest configuration object.
 */
function getBaseJestConfig(packageName) {
	// Get the test port from the global map and set it in env for this test.
	let mappedPort = 8081;
	// Only import test-tools if FLUID_POLICY_CHECK is not set.
	// This allows us to run policy checks on the jest config files without having to build the repo.
	if (process.env.FLUID_POLICY_CHECK === undefined) {
		// Deliberately reaching directly into dist/ to make things work from a cjs file getting code from a ts file.
		// When this require() runs, the package should have been built, so the dist/ folder should exist.
		const { getTestPort } = require("../dist/getTestPort.js");
		mappedPort = getTestPort(packageName);
	}
	process.env.PORT = mappedPort;

	return {
		preset: "jest-puppeteer",
		globals: {
			PATH: `http://localhost:${mappedPort}`,
		},
		testMatch: ["**/?(*.)+(spec|test).ts"],
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
		moduleNameMapper: {
			// While we still have transitive dependencies on 'uuid<9.0.0', force the CJS entry point:
			// See: https://stackoverflow.com/questions/73203367/jest-syntaxerror-unexpected-token-export-with-uuid-library
			"^uuid$": "uuid",
			// Our example apps are generally ESM-only. Some of the Jest tests in those packages import from the package's
			// source code (which they have to do with .js extensions after the module name, to be ESM-compliant), but Jest
			// doesn't fully support ESM yet so we use ts-jest to transform the .ts test files into CJS code for Jest to
			// run. However, the files under src/ don't get transformed in the same way, so when the transformed .js test
			// files execute, they can't find the .js source files they're trying to reference.
			// So during the transformation of test files from .ts into .js, we need to remove the .js extension from module
			// names in imports from our own source files (those starting with './' or '../') so jest tries to load the .ts
			// source files instead of the .js files that don't exist (and since it can find them with the .ts extension,
			// it then gives them to ts-jest to transform).
			"^(\\.{1,2}/.*)\\.js$": "$1",
		},
	};
}

exports.getBaseJestConfig = getBaseJestConfig;
