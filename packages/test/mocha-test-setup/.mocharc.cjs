/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// This package's own self-tests don't use its own `getFluidTestMochaConfig()` (unlike its consumers):
// that helper wires up `mocha-multi-reporters` and `FluidXunitReporter`'s JUnit-compatible XML output,
// which these straightforward unit tests don't need, and using it here would mean this package
// `require`-ing itself as a dependency of its own test run.
module.exports = {
	require: ["source-map-support/register"],
	recursive: true,
	spec: "lib/test/**/*.spec.js",
	"unhandled-rejections": "strict",
	// Fail the test run if no tests are found/run, consistent with `getFluidTestMochaConfig`'s consumers.
	"fail-zero": true,
};
