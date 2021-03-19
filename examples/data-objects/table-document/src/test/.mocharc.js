/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const packageDir = `${__dirname}/../..`;
const moduleDir = `${packageDir}/node_modules`;

const getFluidTestMochaConfig = require("@fluidframework/mocha-test-setup/mocharc-common.js");
const config = getFluidTestMochaConfig(packageDir, [`${moduleDir}/@fluidframework/test-version-utils`]);
module.exports = config;
