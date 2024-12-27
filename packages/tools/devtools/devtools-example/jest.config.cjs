/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { getBaseJestConfig } = require("@fluid-private/test-tools");
const { name } = require("./package.json");
const config = getBaseJestConfig(name);
// This package is using testRegex instead of testMatch
delete config.testMatch;
config.testRegex = "(/__tests__/.*|(\\.|/)(test|spec))\\.ts?$";
config.roots = ["<rootDir>/src"];
config.testTimeout = 30_000;
config.moduleFileExtensions = ["ts", "tsx", "js", "jsx", "json", "node"];
config.coveragePathIgnorePatterns = ["/node_modules/", "/src/test/"];
module.exports = config;
