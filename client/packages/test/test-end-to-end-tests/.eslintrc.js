/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid")],
    parserOptions: {
        project: ["./src/test/tsconfig.json"],
    },
    rules: {
        "prefer-arrow-callback": "off",
        "@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig

        // This library is used in the browser, so we don't want dependencies on most node libraries.
        "import/no-nodejs-modules": ["error", { allow: ["url"] }],
    },
    overrides: [
        {
            // Rules only for test files
            files: ["*.spec.ts", "src/test/**"],
            rules: {
                // Test files are run in node only so additional node libraries can be used.
                "import/no-nodejs-modules": [
                    "error",
                    { allow: ["assert", "url"] },
                ],
            },
        },
    ],
};
