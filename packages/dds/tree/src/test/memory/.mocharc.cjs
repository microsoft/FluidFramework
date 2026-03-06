/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */

const baseConfig = require("../../../.mocharc.cjs");
baseConfig["node-option"].push("expose-gc");
baseConfig["node-option"].push("gc-global");

const extendedConfig = {
	...baseConfig,
	"fgrep": ["@Benchmark", "@Memory"],
	"reporter": "@fluid-tools/benchmark/dist/mocha/Reporter.js",
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
	"timeout": "999999",
};

module.exports = extendedConfig;
