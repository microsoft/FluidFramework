/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const packageDir = `${__dirname}/../..`;
const moduleDir = `${packageDir}/node_modules`;

const getFluidTestMochaConfig = require(`@fluidframework/mocha-test-setup/mocharc-common.js`);
const config = getFluidTestMochaConfig(packageDir, [
	// Inject implementation of getFluidTestDriver, configured via fluid__test__driver
	`${moduleDir}/@fluidframework/test-drivers`,
]);
module.exports = config;
