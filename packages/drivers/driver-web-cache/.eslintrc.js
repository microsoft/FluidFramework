/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This is a workaround for https://github.com/eslint/eslint/issues/3458
require("@fluidframework/eslint-config-fluid/patch/modern-module-resolution");

module.exports = {
    extends: ["@fluidframework/eslint-config-fluid"],
    parserOptions: {
        project: ["./tsconfig.json", "./src/test/tsconfig.json"],
    },
    rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-null/no-null": "off",
        "@typescript-eslint/promise-function-async": "off",
        "@typescript-eslint/no-misused-promises": "off",
    },
};
