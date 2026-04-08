/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const path = require("path");

/**
 * Get the mocha configuration for running tests using the conventions followed in the Fluid Framework repository.
 *
 * @param {string} packageDir - the directory of the package, typically set using `__dirname`
 * @param {string[]} additionalRequiredModules - modules to require in addition to the standard set.
 * @param {string} testReportPrefix - prefix for the test output report file names.
 * @remarks
 * Additional configuration can be provided via environment variables: see {@link file://./README.md}.
 *
 * Users desiring exact control over the `spec` from the CLI should delete or replace the spec from the returned config, since mocha's behavior is to extend it, not override it.
 */
function getFluidTestMochaConfig(packageDir, additionalRequiredModules, testReportPrefix) {
	const requiredModules = [
		// General mocha setup e.g. suppresses console.log,
		// This has to be before others (except logger) so that registerMochaTestWrapperFuncs is available
		"@fluid-internal/mocha-test-setup",
		"source-map-support/register",
		...(additionalRequiredModules ? additionalRequiredModules : []),
	];

	if (process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER) {
		// Inject implementation of createTestLogger, put it first before mocha-test-setup
		requiredModules.unshift(process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER);
	}

	let defaultSpec = "lib/test";
	if (process.env.FLUID_TEST_MODULE_SYSTEM === "CJS") {
		defaultSpec = "dist/test";
		const testVariant = process.env.FLUID_TEST_VARIANT;
		process.env.FLUID_TEST_VARIANT = testVariant !== undefined ? `CJS,${testVariant}` : "CJS";
		testReportPrefix = testReportPrefix !== undefined ? `${testReportPrefix}-CJS` : "CJS";
	}

	const config = {
		"recursive": true,
		"require": requiredModules,
		"unhandled-rejections": "strict",
		// Fail the test run if no tests are found/run. This catches cases where test files fail to
		// load silently (e.g. due to broken imports), which would otherwise produce a green "0 passing"
		// result with exit code 0.
		"fail-zero": true,
		ignore: [
			// Ignore "tools" which are scripts intended to be run, not part of the test suite.
			"**/*.tool.{js,cjs,mjs}",
		],
		"node-option": [
			// Allow test-only indexes to be imported. Search the FF repo for package.json files with this condition to see example usage.
			"conditions=allow-ff-test-exports",
			// Performance tests benefit from having access to GC, and memory tests require it.
			// Exposing it here avoids all packages which do perf testing from having to expose it.
			// Note that since "node-option" is explicitly set,
			// these must be provided here and not via mocha's --v8-expose-gc.
			"expose-gc",
		],
		spec: process.env.MOCHA_SPEC ?? defaultSpec,
	};

	if (process.env.FLUID_TEST_TIMEOUT !== undefined) {
		config["timeout"] = process.env.FLUID_TEST_TIMEOUT;
	}

	const packageJson = require(`${packageDir}/package.json`);
	config["reporter"] = `mocha-multi-reporters`;
	// See https://www.npmjs.com/package/mocha-multi-reporters#cmroutput-option
	const outputFilePrefix = testReportPrefix !== undefined ? `${testReportPrefix}-` : "";
	if (!process.env.SILENT_TEST_OUTPUT) {
		console.log(
			`Writing test results relative to package to nyc/${outputFilePrefix}junit-report.xml`,
		);
	}
	const suiteName =
		testReportPrefix !== undefined
			? `${packageJson.name} - ${testReportPrefix}`
			: packageJson.name;
	config["reporter-options"] = [
		`configFile=${path.join(
			__dirname,
			"test-config.json",
		)},cmrOutput=xunit+output+${outputFilePrefix}:xunit+suiteName+${suiteName}`,
	];

	if (process.env.FLUID_TEST_FORBID_ONLY !== undefined) {
		config["forbid-only"] = true;
	}

	return config;
}

module.exports = getFluidTestMochaConfig;
