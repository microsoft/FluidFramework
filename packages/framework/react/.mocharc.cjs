/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");

const config = getFluidTestMochaConfig(__dirname);
// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves.
// AB#7856
config.exit = true;

const registerPath = path.resolve(__dirname, "src/test/reactAlias/register.mjs");
config["node-option"] = [
	...(config["node-option"] ?? []),
	`import=${pathToFileURL(registerPath).href}`,
];

module.exports = config;
