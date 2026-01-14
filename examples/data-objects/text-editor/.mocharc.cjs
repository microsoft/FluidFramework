/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);

// Add CSS loader hook to handle .css imports from Quill
config["node-option"] = [...(config["node-option"] ?? []), "import=./src/test/mochaHooks.mjs"];

module.exports = config;
