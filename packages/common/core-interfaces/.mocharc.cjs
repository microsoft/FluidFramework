/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// @fluid-internal/mocha-test-setup depends on this package, so we can't use it.

const testCJS = process.env.FLUID_TEST_MODULE_SYSTEM === "CJS";
const outputFilePrefix = testCJS ? "CJS-" : "";
const suiteName = "@fluidframework/core-interfaces" + (testCJS ? " - CJS" : "");
module.exports = {
	spec: testCJS ? "dist/test/**/*.spec.*js" : "lib/test/**/*.spec.*js",
	recursive: true,
	require: [testCJS ? "./dist/test/mochaHooks.js" : "./lib/test/mochaHooks.js"],
	reporter: "mocha-multi-reporters",
	"reporter-options": [
		`configFile=test-config.json,cmrOutput=xunit+output+${outputFilePrefix}:xunit+suiteName+${suiteName}`,
	],
	"unhandled-rejections": "strict",
};
