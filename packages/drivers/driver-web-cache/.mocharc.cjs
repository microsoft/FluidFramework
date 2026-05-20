/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// Tests use fake-indexeddb v3 (CJS-only) and require browser-like globals.
// setup.cjs installs window/self aliases and fake-indexeddb before tests run.
const config = getFluidTestMochaConfig(__dirname, [`${__dirname}/src/test/setup.cjs`]);
// Node's BroadcastChannel (used by FluidCache for cross-instance change notifications)
// keeps the event loop alive even after `close()` is invoked. All tests explicitly
// `dispose()` every FluidCache they create — and `dispose()` closes the channel — but
// node still won't let the process exit on its own. Force mocha to exit after the run.
config.exit = true;
module.exports = config;
