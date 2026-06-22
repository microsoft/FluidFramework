/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
config.spec = "lib/test/**/*.spec.*js";
// Explicit exit is used to cut off any dangling GC / summarizer workloads.
config.exit = true;
module.exports = config;
