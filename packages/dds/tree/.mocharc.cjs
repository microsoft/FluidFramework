/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
config.spec = process.env.MOCHA_SPEC ?? "lib/test";
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves
// In this package, tests which use `TestTreeProvider.create` cause this issue, but there might be other cases as well.
// AB#7856
config.exit = true;
module.exports = config;
