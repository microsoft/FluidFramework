/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = __dirname;
const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);

const args = process.argv.slice(2);

const driverIndex = args.indexOf("--driver");
const endpointIndex = args.indexOf("--odspEndpointName");

// Data_driverEndpointName
process.env.FLUID_ENDPOINTNAME = endpointIndex;

module.exports = config;
