/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const { existsSync } = require("fs");
const path = require("path");

function getFluidTestMochaConfig(packageDir, additionalRequiredModules, testReportPrefix) {
	const moduleDir = `${packageDir}/node_modules`;

	const requiredModules = [
		// General mocha setup e.g. suppresses console.log,
		// This has to be before others (except logger) so that registerMochaTestWrapperFuncs is available
		`@fluidframework/mocha-test-setup`,
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

	if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
		// Inject implementation of getTestLogger, put it first before mocha-test-setup
		requiredModulePaths.unshift(process.env.FLUID_TEST_LOGGER_PKG_PATH);
	}

	const config = {
		"exit": true,
		"recursive": true,
		"require": requiredModulePaths,
		"unhandled-rejections": "strict",
	};

	if (process.env.FLUID_TEST_TIMEOUT !== undefined) {
		config["timeout"] = process.env.FLUID_TEST_TIMEOUT;
	}

	if (process.env.FLUID_TEST_REPORT === "1") {
		const packageJson = require(`${packageDir}/package.json`);
		config["reporter"] = `xunit`;
		if (testReportPrefix) {
			config["reporter-options"] = [
				// give the report file a unique name based on testReportPrefix
				`output=${packageDir}/nyc/${testReportPrefix}-junit-report.xml`,
				`suiteName=${packageJson.name} - ${testReportPrefix}`,
			];
		} else {
			config["reporter-options"] = [
				`output=${packageDir}/nyc/junit-report.xml`,
				`suiteName=${packageJson.name}`,
			];
		}
	}

	if (process.env.FLUID_TEST_FORBID_ONLY !== undefined) {
		config["forbid-only"] = true;
	}

	return config;
}

module.exports = getFluidTestMochaConfig;
