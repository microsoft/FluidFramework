/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid/strict")
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "overrides": [
        {
            "files": ["src/test/types/validateAzureClientPrevious.ts"],
            "rules": {
                "@typescript-eslint/no-unsafe-argument": "off",
            },
        },
    ],
}
