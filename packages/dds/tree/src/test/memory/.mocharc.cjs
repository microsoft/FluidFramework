/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */

const baseConfig = require("../../../.mocharc.cjs");

const baseNodeOptions =
	baseConfig["node-option"] !== undefined
		? Array.isArray(baseConfig["node-option"])
			? baseConfig["node-option"]
			: [baseConfig["node-option"]] // If string, wrap as array to use spread operator
		: []; // If undefined, use an empty array

const extendedConfig = {
	...baseConfig,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"node-option": [...baseNodeOptions, "expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
};

module.exports = extendedConfig;
