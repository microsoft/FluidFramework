/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// These tests need to be run with multiple different test file filters for different cases.
// As this is a rather different setup, it's simplest to just let the individual scripts specify what they need and disable the default.
delete config.spec;
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves
// AB#7856
config.exit = true;
module.exports = config;
