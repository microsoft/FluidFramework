/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
if (process.env.FLUID_MERGE_TREE_PARALLEL === "1") {
	// Parallel fail-zero applies per file, so don't schedule helper modules as tests.
	config.spec = process.env.MOCHA_SPEC ?? `${config.spec}/**/*.spec.js`;
	config.parallel = true;
	config.jobs = 4;
}
module.exports = config;
