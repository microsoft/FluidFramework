/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// @fluid-internal/mocha-test-setup depends on this package, so we can't use it.

const testCJS = process.env.FLUID_TEST_MODULE_SYSTEM === "CJS";
// Embed the sanitized package name in the JUnit report's file name itself (not just its directory). Azure
// DevOps's JUnit importer determines the "Test file" grouping for a set of results from the report's physical
// file name when the report contains multiple `<testsuite>` elements, which is always the case for
// mocha-junit-reporter's output (one per describe block). Without a package-specific file name, every
// package's report would be named identically ("junit-report.xml"), and Azure DevOps would show every
// package's tests grouped under the same indistinguishable "JUnit_junit-report.xml" entry.
const outputFilePrefix = `fluidframework-core-interfaces-${testCJS ? "CJS-" : ""}`;
const suiteName = "@fluidframework/core-interfaces" + (testCJS ? " - CJS" : "");
module.exports = {
	spec: testCJS ? "dist/test/**/*.spec.*js" : "lib/test/**/*.spec.*js",
	recursive: true,
	require: [testCJS ? "./dist/test/mochaHooks.js" : "./lib/test/mochaHooks.js"],
	reporter: "mocha-multi-reporters",
	"reporter-options": [
		`configFile=test-config.json,cmrOutput=mocha-junit-reporter+mochaFile+${outputFilePrefix}:mocha-junit-reporter+testsuitesTitle+${suiteName}`,
	],
	"unhandled-rejections": "strict",
};
