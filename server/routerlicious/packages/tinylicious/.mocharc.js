/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluidframework/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
module.exports = config;
