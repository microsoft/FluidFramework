/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);

const args = process.argv.slice(2);

function getFluidTestVariant() {
	const driverIndex = args.indexOf("--driver");
	const endpointIndex = args.indexOf("--driverEndpoint");

	const testDriver = driverIndex !== -1 ? args[driverIndex + 1] : "";
	const endpointName = endpointIndex !== -1 ? args[endpointIndex + 1] : "";

	return `${testDriver}-${endpointName}`;
}

function getFluidTestMocha(packageDir, additionalRequiredModules = []) {
	const testVariant = getFluidTestVariant();
	process.env.FLUID_TEST_VARIANT = testVariant;

	return config(packageDir, additionalRequiredModules, testVariant);
}

module.exports = getFluidTestMocha;
