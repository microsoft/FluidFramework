/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { getBaseJestConfig } = require("@fluid-private/test-tools");
const { name } = require("./package.json");

const config = getBaseJestConfig(name);
config.testTimeout = 10000;
module.exports = config;
