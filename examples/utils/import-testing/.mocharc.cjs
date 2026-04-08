/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// The build tests can be slow, especially on CI sometimes.
// 10-13 seconds is normal for them, but sometimes they take over 20 seconds.
config.timeout = 50000;
module.exports = config;
