/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */

const baseConfig = require("../../../.mocharc.cjs");
baseConfig["node-option"].push("gc-global");

const extendedConfig = {
	...baseConfig,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
};

module.exports = extendedConfig;
