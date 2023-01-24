/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
    rules: {
        "@typescript-eslint/strict-boolean-expressions": "off",

    },
    overrides: [
        {
            // Rules only for test files
            files: ["*.spec.ts", "src/test/**"],
            rules: {
                // Test files are run in node only so additional node libraries can be used.
                "import/no-nodejs-modules": ["error", { allow: ["assert", "events"] }],

            },
        },
    ],
};
