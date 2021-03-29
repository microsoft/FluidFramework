/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const packageDir = `${__dirname}/../..`;

const getFluidTestMochaConfig = require("@fluidframework/mocha-test-setup/mocharc-common.js");
const config = getFluidTestMochaConfig(packageDir, ["@fluidframework/test-version-utils"]);
module.exports = config;
