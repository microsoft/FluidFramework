/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname, ["./test-setup.cjs"]);
module.exports = {
	...config,
	// Many tests interact with React components in jsdom. These interactions and
	// accessibility checks can exceed Mocha's two-second default under full-suite load.
	timeout: 5000,
};
