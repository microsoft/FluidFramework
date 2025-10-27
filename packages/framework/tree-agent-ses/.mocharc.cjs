/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// Reuse shared Fluid test mocha config for this package
const config = getFluidTestMochaConfig(__dirname);
module.exports = config;
