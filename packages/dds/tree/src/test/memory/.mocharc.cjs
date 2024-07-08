/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */

const baseConfig = require("../../../.mocharc.cjs");

const baseNodeOptions = Array.isArray(baseConfig["node-option"])
	? baseConfig["node-option"]
	: [baseConfig["node-option"]]; // If string, wrap in array to use spread operator.

const extendedConfig = {
	...baseConfig,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"node-option": [...baseNodeOptions, "expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"reporter": "@fluid-tools/benchmark/dist/MochaMemoryTestReporter.js", // Changed reporter option to use the memory test reporter.
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
	"timeout": "240000",
};

module.exports = extendedConfig;
