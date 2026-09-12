/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// @fluid-internal/mocha-test-setup depends on this package, so we can't use it.

const testCJS = process.env.FLUID_TEST_MODULE_SYSTEM === "CJS";
const outputFilePrefix = testCJS ? "CJS-" : "";
const suiteName = "@fluidframework/core-interfaces" + (testCJS ? " - CJS" : "");
// "./FluidMochaReporter.cjs" below must be the exact module specifier mocha-multi-reporters will
// `require(...)` to load the reporter (see its source:
// https://github.com/stevemao/mocha-multi-reporters/blob/master/lib/MultiReporters.js). It also determines
// the reporter-specific option key mocha-multi-reporters expects in test-config.json: it camelCases this
// exact string and appends "ReporterOptions" (e.g. "./FluidMochaReporter.cjs" ->
// "fluidMochaReporterCjsReporterOptions"). Unlike mocha-test-setup's xunit-reporter (referenced by package
// export subpath, so it must match that subpath's name exactly), this one is referenced by relative file
// path, so the file itself can be named anything.
module.exports = {
	spec: testCJS ? "dist/test/**/*.spec.*js" : "lib/test/**/*.spec.*js",
	recursive: true,
	require: [testCJS ? "./dist/test/mochaHooks.js" : "./lib/test/mochaHooks.js"],
	reporter: "mocha-multi-reporters",
	"reporter-options": [
		`configFile=test-config.json,cmrOutput=./FluidMochaReporter.cjs+output+${outputFilePrefix}:./FluidMochaReporter.cjs+suiteName+${suiteName}`,
	],
	"unhandled-rejections": "strict",
};
