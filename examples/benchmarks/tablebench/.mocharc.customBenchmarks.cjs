/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run memory-profiling tests
 */
"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const baseConfig = getFluidTestMochaConfig(packageDir);

const nodeOptions =
	baseConfig["node-option"] !== undefined
		? Array.isArray(baseConfig["node-option"])
			? baseConfig["node-option"]
			: [baseConfig["node-option"]] // If string, wrap as array to use spread operator
		: []; // If undefined, use an empty array

nodeOptions.push("expose-gc", "gc-global", "unhandled-rejections=strict");

module.exports = {
	...baseConfig,
	"fgrep": ["@CustomBenchmark"],
	"node-option": nodeOptions, // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.customBenchmarksOutput/"],
	"spec": ["lib/test/**/*.*js"],
};
