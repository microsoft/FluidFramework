/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run execution-time-profiling tests
 */

module.exports = {
	"exit": true,
	"fgrep": ["@Benchmark", "@ExecutionTime"],
	"node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.timeTestsOutput/"],
	"require": ["node_modules/@fluid-internal/mocha-test-setup"],
	"spec": ["dist/test/time/**/*.spec.*js", "--perfMode"],
	"timeout": "15000",
};
