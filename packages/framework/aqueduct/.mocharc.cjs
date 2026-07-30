/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// This package has no tests; disable fail-zero so the empty placeholder spec doesn't fail the run.
config["fail-zero"] = false;
module.exports = config;
