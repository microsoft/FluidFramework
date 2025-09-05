/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// This package needs custom test file filtering to make `ddsSuiteCases` not break the normal test run, so disable the default configuration.
delete config.spec;
module.exports = config;
