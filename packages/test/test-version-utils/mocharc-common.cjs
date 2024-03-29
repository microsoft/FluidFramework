/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";
const options = require("./dist/compatOptions.js");
const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

function getFluidTestVariant() {
	const testDriver = options.driver;
	const r11sEndpointName = options.r11sEndpointName;
	const testVariant =
		(testDriver === "r11s" || testDriver === "routerlicious") &&
		r11sEndpointName !== undefined &&
		r11sEndpointName !== "r11s"
			? `r11s-${r11sEndpointName}`
			: testDriver;
	return testVariant;
}

function getFluidTestMochaConfigWithCompat(packageDir, additionalRequiredModules = []) {
	const testVariant = getFluidTestVariant();
	process.env.FLUID_TEST_VARIANT = testVariant;

	let testReportPrefix = testVariant;
	if (options.compatVersions) {
		testReportPrefix += `_${options.compatVersions.join("_")}`;
	}
	if (options.compatKind) {
		testReportPrefix += `_${options.compatKind.join("_")}`;
	}

	return getFluidTestMochaConfig(packageDir, additionalRequiredModules, testReportPrefix);
}

module.exports = getFluidTestMochaConfigWithCompat;
