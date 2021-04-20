/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/eslint7"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "rules": {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-bitwise": "off",
        "no-null/no-null": "off",
        "prefer-arrow/prefer-arrow-functions": "off",
        "prefer-rest-params": "off"
    }
}
