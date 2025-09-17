/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const { existsSync } = require("fs");
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
	const moduleDir = `${packageDir}/node_modules`;

	const requiredModules = [
		// General mocha setup e.g. suppresses console.log,
		// This has to be before others (except logger) so that registerMochaTestWrapperFuncs is available
		"@fluid-internal/mocha-test-setup",
		"source-map-support/register",
		...(additionalRequiredModules ? additionalRequiredModules : []),
	];

	// mocha install node_modules directory might not be the same as the module required because of hoisting
	// We need to give the full path in that case.
	// TODO: this path mapping might not be necessary once we move to pnpm, since it sets up node_modules differently
	// from what Lerna does (all dependencies of a given package show up in its own node_modules folder and just symlink
	// to the actual location of the installed package, instead of common dependencies being hoisted to a parent
	// node_modules folder and not being present at all in the package's own node_modules).
	const requiredModulePaths = requiredModules.map((mod) => {
		// Just return if it is path already
		if (existsSync(mod) || existsSync(`${mod}.js`)) {
			return mod;
		}

		// Try to find it in the test package's directory
		const modulePath = path.join(moduleDir, mod);
		if (existsSync(modulePath)) {
			return modulePath;
		}

		// Otherwise keep it as is
		return mod;
	});

	if (process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER) {
		const modulePath = path.join(moduleDir, process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER);
		// Inject implementation of createTestLogger, put it first before mocha-test-setup
		if (existsSync(modulePath)) {
			requiredModulePaths.unshift(modulePath);
		}
	}

	const config = {
		"recursive": true,
		"require": requiredModulePaths,
		"unhandled-rejections": "strict",
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
		spec: process.env.MOCHA_SPEC ?? "lib/test",
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
