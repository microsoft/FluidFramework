/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: ["@fluidframework/eslint-config-fluid/strict"],
    parserOptions: {
        project: ["./tsconfig.json", "./src/test/tsconfig.json"],
    },
    rules: {
        // This library is used in the browser, so we don't want dependencies on most node libraries.
        "import/no-nodejs-modules": ["error", { allow: ["events"] }],
    },
    overrides: [
        {
            // Rules only for test files
            files: ["*.spec.ts", "src/test/**"],
            rules: {
                // This library is used in the browser, so we don't want dependencies on most node libraries.
                "import/no-nodejs-modules": ["error", { allow: ["assert","events"] }],
            },
        },
    ],
};
