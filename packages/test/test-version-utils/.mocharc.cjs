/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("./mocharc-common.cjs");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
module.exports = config;
