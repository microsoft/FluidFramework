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

baseConfig["node-option"].push("gc-global");

module.exports = {
	...baseConfig,
	"fgrep": ["@CustomBenchmark"],
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.customBenchmarksOutput/"],
	"spec": ["lib/test/**/*.*js"],
};
