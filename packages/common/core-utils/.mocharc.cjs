/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluidframework/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
// Ideally we would test the ESM output, but the tests need to be updated to work with ESM (mostly sinon)
config.spec = "dist/commonjs/test";
module.exports = config;
