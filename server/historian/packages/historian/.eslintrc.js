/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/formatting"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json"]
    },
    "rules": {
        "@typescript-eslint/strict-boolean-expressions": "off",
    }
}
