/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves.
// AB#7856
config.exit = true;

// Quill accesses `document` at module-import time, so JSDOM must be initialized before any test
// files are loaded. Requiring mochaHooks explicitly here guarantees it runs before spec discovery,
// regardless of alphabetical file-load order within lib/test/.
config.require = [...config.require, "./lib/test/mochaHooks.js"];

module.exports = config;
