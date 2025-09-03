/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run memory-profiling tests
 */
"use strict";

const baseConfig = require("./.mocharc.cjs");

baseConfig["node-option"].push("gc-global");

module.exports = {
	...baseConfig,
	"fgrep": ["@CustomBenchmark"],
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.customBenchmarksOutput/"],
};
