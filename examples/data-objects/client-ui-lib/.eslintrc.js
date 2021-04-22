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
        "@typescript-eslint/consistent-type-assertions": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-bitwise": "off",
        "no-case-declarations": "off",
        "no-null/no-null": "off",
        "prefer-arrow/prefer-arrow-functions": "off"
    }
}
