/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-inner-declarations": "off",
        "no-param-reassign": "off",
        "prefer-arrow/prefer-arrow-functions": "off"
    },
    "parserOptions": {
        "project": [ "./tsconfig.json", "./tsconfig.eslint.json" ]
    }
}