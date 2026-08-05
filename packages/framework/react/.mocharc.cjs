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

// Pin React imports to a single, explicit version per test run via an ESM module resolution hook.
// Both React 18 (default) and React 19 (REACT_VERSION=19) are installed under npm aliases; the hook
// remaps the bare `react` / `react-dom` specifiers so resolution is deterministic regardless of how
// pnpm binds @testing-library/react's peers. See ./src/test/reactAlias/hooks.mjs for details.
const registerPath = path.resolve(__dirname, "src/test/reactAlias/register.mjs");
config["node-option"] = [
	...(config["node-option"] ?? []),
	`import=${pathToFileURL(registerPath).href}`,
];

module.exports = config;
