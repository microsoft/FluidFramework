/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// Tests run against CJS output (dist/test) due to FluentUI lacking proper ESM support.
// See https://github.com/microsoft/fluentui/issues/30778.
const config = getFluidTestMochaConfig(__dirname, [
	"global-jsdom/register",
	`${__dirname}/jest.setup.cjs`,
]);
module.exports = { ...config, timeout: 10000, exit: true };
