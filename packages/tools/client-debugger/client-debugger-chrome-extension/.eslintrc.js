/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
    parserOptions: {
        project: ["./tsconfig.json"],
    },
    rules: {
        // Disabled because it conflicts with Prettier.
        "unicorn/no-nested-ternary": "off",
    },
    overrides: [
        {
            // Overrides for test files
            files: ["*.spec.ts", "*.test.ts", "src/test/**"],
            plugins: ["jest"],
            extends: ["plugin:jest/recommended"],
            rules: {
                "import/no-nodejs-modules": "off",
                "unicorn/prefer-module": "off",
            },
        },
    ],
};
