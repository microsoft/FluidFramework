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
module.exports = config;
