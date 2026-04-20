/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);

// Set up JSDOM before Quill is imported (Quill requires document at import time)
config["node-option"].push("import=./lib/test/mochaHooks.js");

module.exports = config;
