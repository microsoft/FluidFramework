/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run memory-profiling tests
 */

module.exports = {
	"exit": true,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
	"require": ["node_modules/@fluid-internal/mocha-test-setup"],
	"spec": ["dist/test/memory/**/*.spec.*js", "--perfMode"],
	"timeout": "60000",
};
