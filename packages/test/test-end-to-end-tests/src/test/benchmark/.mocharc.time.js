/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for runtime profiling tests
 */

module.exports = {
	"extends": "../.mocharc.js",
	"exit": true,
	"fgrep": ["@Benchmark", "@ExecutionTime"],
	"node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaReporter.js",
	"reporterOptions": ["reportDir=.timeTestsOutput/"],
	"require": ["node_modules/@fluidframework/mocha-test-setup"],
	"spec": ["dist/test/benchmark/**/*.time.spec.js", "--perfMode"],
	"timeout": "60000",
};
