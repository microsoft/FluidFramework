/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
config.spec = ["lib/test/*Farm*.spec.js", "lib/test/beastTest*.spec.js"];
config.parallel = true;
module.exports = config;
