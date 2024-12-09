/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const getBaseJestConfig = require("../../../getBaseJestConfig.cjs");
const { name } = require("./package.json");
const config = getBaseJestConfig(name);
module.exports = config;
