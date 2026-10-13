/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file exists to preserve CommonJS default export compatibility for the xunit-reporter entrypoint,
// since `mocha-multi-reporters` loads reporters via a plain CommonJS `require()`.
// Once all consumers are using named imports, this file can be removed and all conditions can point
// directly to the ESM file. attw xunit-reporter exclusion can also be removed at that time.

"use strict";

const { FluidXunitReporter } = require("./lib/xunitReporter.js");

module.exports = FluidXunitReporter;
