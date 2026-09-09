/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
const outputDirectory = process.env.FLUID_TEST_MODULE_SYSTEM === "CJS" ? "dist" : "lib";
config.require.push(`${__dirname}/${outputDirectory}/test/socketModuleMock.js`);
config["node-option"].push("experimental-test-module-mocks");
module.exports = config;
