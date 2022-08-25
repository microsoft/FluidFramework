/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
    parserOptions: {
        project: [
            "./tsconfig.json",
            "./src/test/mocha/tsconfig.json",
            "./src/test/jest/tsconfig.json",
            "./src/test/types/tsconfig.json",
        ],
    },
    rules: {
        // TODO: Remove once this config extends `recommended` or `strict` above.
        "@typescript-eslint/explicit-function-return-type": "error",
    },
};
