/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file exists to preserve CommonJS default export compatibility for the junit-reporter entrypoint,
// since `mocha-multi-reporters` loads reporters via a plain CommonJS `require()`.
// Once all consumers are using named imports, this file can be removed and all conditions can point
// directly to the ESM file. attw junit-reporter exclusion can also be removed at that time.

"use strict";

const { FluidJUnitReporter } = require("./lib/junitReporter.js");

module.exports = FluidJUnitReporter;
