/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname, ["global-jsdom/register"]);
// Force exit after tests complete — jsdom leaves pending network requests open
// when App Insights tries to phone home during tests, preventing clean shutdown.
module.exports = { ...config, exit: true };
