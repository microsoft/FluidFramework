/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const packageDir = __dirname;
const config = getFluidTestMochaConfig(packageDir);
// Setting node options prevents mocha's node options from getting use (like --v8-expose-gc)
// This is done (instead of the workaround by adding stuff to "node-option")
// so --v8-expose-gc can be tested as that is the documented (in the readme) approach.
// This is ok as this package does not need the node-options from the default config.
delete config["node-option"];
module.exports = config;
