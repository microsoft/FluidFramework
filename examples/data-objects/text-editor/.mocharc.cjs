/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);

// Register the CSS loader before specs run so app.tsx's `import "quill-next/dist/quill.snow.css"`
// resolves under Node (which can't natively load .css files).
config["node-option"].push("import=./lib/test/mochaHooks.js");

module.exports = config;
