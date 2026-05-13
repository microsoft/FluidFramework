/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);

// Run mochaHooks before specs load: registers the CSS loader so `import "quill-next/dist/quill.snow.css"`
// resolves under Node, and installs JSDOM so app.tsx's module load `start()` call has a `document`.
config["node-option"].push("import=./lib/test/mochaHooks.js");

module.exports = config;
