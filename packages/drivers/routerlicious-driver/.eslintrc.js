/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid")],
    parserOptions: {
        project: ["./tsconfig.json", "./src/test/tsconfig.json"],
    },
    rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-case-declarations": "off",
    },
    overrides: [
        {
            // Rules only for type validation files
            files: ["**/test/types/*.generated.*"],
            rules: {
                "max-len": "off",
                "@typescript-eslint/semi": "off",
                "@typescript-eslint/comma-spacing": "off",
            },
        },
    ],
};
