/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Some unit tests in this package verify that mocha-based features of the test harness work correctly
// (e.g. replaying specific fuzz seeds or using `.only` and/or `.skip` to control which tests run).
// They do so by running a nested mocha process, which we want to be as close as reasonable to the config
// we actually use to run tests. We use this config to tweak the reporting format to be strictly JSON for easier parsing
// and allow `.only` even in CI contexts.
"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");
const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
config["reporter"] = "json";
config["forbid-only"] = false;
delete config["reporter-options"];

module.exports = config;
