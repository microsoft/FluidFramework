/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type FluidTestMochaConfig,
	getFluidTestMochaConfig,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluid-internal/mocha-test-setup/mocharc-common";

import { compatKind, compatVersions, driver, r11sEndpointName } from "./compatOptions.js";

function getFluidTestVariant(): string | undefined {
	const testDriver = driver;
	const testVariant =
		(testDriver === "r11s" || testDriver === "routerlicious") &&
		r11sEndpointName !== undefined &&
		r11sEndpointName !== "r11s"
			? `r11s-${r11sEndpointName}`
			: testDriver;
	return testVariant;
}

/**
 * Get the mocha configuration for running compat tests using the conventions followed in the Fluid Framework repository.
 *
 * @param packageDir - the directory of the package, typically set using `__dirname`
 * @param additionalRequiredModules - modules to require in addition to the standard set.
 */
export function getFluidTestMochaConfigWithCompat(
	packageDir: string,
	additionalRequiredModules: string[] = [],
): FluidTestMochaConfig {
	const testVariant = getFluidTestVariant();
	process.env.FLUID_TEST_VARIANT = testVariant;

	let testReportPrefix = testVariant;
	if (compatVersions) {
		testReportPrefix += `_${compatVersions.join("_")}`;
	}
	if (compatKind) {
		testReportPrefix += `_${compatKind.join("_")}`;
	}

	return getFluidTestMochaConfig(packageDir, additionalRequiredModules, testReportPrefix);
}
