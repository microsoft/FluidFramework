/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// Tests use fake-indexeddb v3 (CJS-only) and require browser-like globals.
// setup.cjs installs window/self aliases and fake-indexeddb before tests run.
const config = getFluidTestMochaConfig(__dirname, [`${__dirname}/src/test/setup.cjs`]);
module.exports = config;
