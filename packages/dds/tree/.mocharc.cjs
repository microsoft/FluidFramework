/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

// The default "spec" for this package will include `.../test/mochaHooks.js`.
// so including it here would be redundant.
// Additionally adding it as a required module does not work since required modules can not add hooks (see https://github.com/mochajs/mocha/issues/764).

const config = getFluidTestMochaConfig(
	__dirname,
	[],
	process.argv.includes("--emulateProduction") ? "PROD" : undefined,
);
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves
// In this package, tests which use `TestTreeProvider.create` cause this issue, but there might be other cases as well.
// AB#7856
config.exit = true;
module.exports = config;
