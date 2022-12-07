/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
    plugins: ["eslint-plugin-jsdoc"],
    parserOptions: {
        project: ["./tsconfig.json"],
    },
    overrides: [
        {
            files: ["packageVersion.ts"],
            rules: {
                "jsdoc/require-jsdoc": "off",
                "jsdoc/require-description": "off",
            },
        },
    ],
};
