/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run execution time tests
 */

module.exports = {
	"fgrep": ["@Benchmark", "@Duration"],
	"node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/mocha/Reporter.js",
	"require": ["@fluid-internal/mocha-test-setup"],
	"spec": ["dist/test/time/**/*.spec.*js", "--perfMode"],
	"timeout": "15000",
};
