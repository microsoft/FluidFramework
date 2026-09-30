/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file exists to preserve CommonJS default export compatibility for the mocharc-common entrypoint.
// Once all consumers are using named imports, this file can be removed and all conditions can point
// directly to the ESM file. attw mocharc-common exclusion can also be removed at that time.

"use strict";

const { getFluidTestMochaConfig } = require("./lib/mocharcCommon.js");

module.exports = getFluidTestMochaConfig;
module.exports.getFluidTestMochaConfig = getFluidTestMochaConfig;
