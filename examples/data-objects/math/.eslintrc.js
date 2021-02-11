/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
        "@typescript-eslint/no-use-before-define":"off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "max-len": "off",
        "no-bitwise":"off",
        "no-case-declarations":"off",
        "no-inner-declarations":"off",
        "prefer-arrow/prefer-arrow-functions":"off",
        "prefer-template":"off"
    }
}
