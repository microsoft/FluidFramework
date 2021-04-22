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
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-inner-declarations": "off",
        "prefer-arrow/prefer-arrow-functions": "off"
    },
}
