/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const eslintConfig = require("@fluidframework/eslint-config-fluid");

const noTypeScript = x => !x.includes("typescript");

const jsOnlyRules = {};
Object.keys(eslintConfig.rules).filter(noTypeScript).forEach(x => jsOnlyRules[x] = eslintConfig.rules[x]);
eslintConfig.rules = jsOnlyRules;

eslintConfig.extends = eslintConfig.extends.filter(noTypeScript);
eslintConfig.plugins = eslintConfig.plugins.filter(noTypeScript);
eslintConfig.parserOptions = {
    "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
};
module.exports = eslintConfig;
