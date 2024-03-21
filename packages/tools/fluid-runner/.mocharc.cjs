/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");
const _dirname = require("./dirname.cjs");

const packageDir = _dirname;
const config = getFluidTestMochaConfig(packageDir);
module.exports = config;
