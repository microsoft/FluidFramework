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
	"timeout": "360000", // depending on the test and the size of the E2E document, the timeout might not be enough. To address it, let's first try to decrease the number of iterations (minSampleCount).
};

module.exports = extendedConfig;
