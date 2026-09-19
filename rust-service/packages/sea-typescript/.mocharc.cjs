/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(
	__dirname,
	undefined,
	process.env.SEA_NODE_TRANSPORT_URL ? "live-websocket" : undefined,
);
config.spec = process.env.MOCHA_SPEC ?? "lib/test/**/*.spec.js";
module.exports = config;
