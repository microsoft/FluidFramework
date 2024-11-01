/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = __dirname;
const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);

// const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// const args = process.argv.slice(2);

// function getFluidTestVariant() {
// 	const driverIndex = args.indexOf("--driver");
// 	const endpointIndex = args.indexOf("--odspEndpointName");

// 	const testDriver = driverIndex !== -1 ? args[driverIndex + 1] : "";
// 	const endpointName = endpointIndex !== -1 ? args[endpointIndex + 1] : "";

// 	return `${testDriver}-${endpointName}`;
// }

// function getFluidTestMocha(packageDir, additionalRequiredModules = []) {
// 	const testVariant = getFluidTestVariant();
// 	process.env.FLUID_TEST_VARIANT = testVariant;

// 	return getFluidTestMochaConfig(packageDir, additionalRequiredModules, testVariant);
// }

// module.exports = getFluidTestMocha(packageDir);

module.exports = config;
