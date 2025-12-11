/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname, [
	"jsdom-global/register",
	"./test-setup.cjs",
]);
module.exports = {
	...config,
	timeout: 5000,
};
