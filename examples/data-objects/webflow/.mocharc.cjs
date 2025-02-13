/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = __dirname;

const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves
// AB#7856
config.exit = true;
module.exports = config;
