/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/recommended"
    ],
    "parserOptions": {
        "project": [
            "./tsconfig.json",
            "./src/test/mocha/tsconfig.json",
            "./src/test/jest/tsconfig.json",
            "./src/test/types/tsconfig.json",
        ]
    },
    "rules": {
        "import/no-nodejs-modules": "error",
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
