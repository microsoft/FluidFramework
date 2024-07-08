/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */

const getFluidTreeTestMochaConfig = require("../../../.mocharc.cjs");

const extendedConfig = {
	...getFluidTreeTestMochaConfig,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"node-option": [
		"conditions=allow-ff-test-exports",
		"expose-gc",
		"gc-global",
		"unhandled-rejections=strict",
	], // without leading "--"
	"reporter": "@fluid-tools/benchmark/dist/MochaMemoryTestReporter.js", // Changed reporter option to use the memory test reporter.
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
	"timeout": "90000",
};

module.exports = extendedConfig;
