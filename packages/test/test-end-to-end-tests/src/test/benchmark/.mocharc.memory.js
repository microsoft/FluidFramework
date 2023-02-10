/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file for memory profiling tests
 */
const getFluidTestMochaConfig = require("@fluidframework/test-version-utils/mocharc-common.js");
const config = getFluidTestMochaConfig(packageDir);
const newConfig = {
	"extends": "../.mocharc.js",
	"exit": true,
	"fgrep": ["@Benchmark", "@MemoryUsage"],
	"node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
	"recursive": true,
	"reporter": "@fluid-tools/benchmark/dist/MochaMemoryTestReporter.js",
	"reporterOptions": ["reportDir=.memoryTestsOutput/"],
	"require": [...config.require, "node_modules/@fluidframework/mocha-test-setup"],
	"spec": ["dist/test/benchmark/**/*.memory.spec.js", "--perfMode"],
	"timeout": "60000",
};
console.log("NewConfig", JSON.parse(newConfig));
console.log("Config", JSON.parse(config));
console.log("Require", JSON.parse(newConfig.require));
module.exports = newConfig;
