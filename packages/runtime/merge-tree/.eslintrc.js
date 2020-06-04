/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "rules": {
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "keyword-spacing": "off", // Off because it conflicts with typescript-formatter
        "no-case-declarations": "off",
        "no-null/no-null": "off",
        "prefer-arrow/prefer-arrow-functions": "off"
    }
}
