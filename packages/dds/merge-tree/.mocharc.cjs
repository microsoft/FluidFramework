/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// Parallelize tests to speed up CI, but not in perf mode where parallel execution
// breaks the benchmark reporter and degrades measurement quality.
if (!process.argv.includes("--perfMode")) {
	config.parallel = true;
	// Keep job count limited to avoid excessive memory use and thread overhead in CI.
	// 4 jobs was measured to give most of the speed up while not slowing down CI.
	config.jobs = 4;
}
module.exports = config;
