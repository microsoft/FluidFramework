/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/strict"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "overrides": [
        {
            // Rules only for test files
            "files": [
                "**/*.spec.ts",
                "src/test/**"
            ],
            "rules": {
                "@typescript-eslint/explicit-function-return-type": "off",
                "unicorn/consistent-function-scoping": [
                    "error", {
                        "checkArrowFunctions": false
                    }
                ],
            },
        }
    ],
}
