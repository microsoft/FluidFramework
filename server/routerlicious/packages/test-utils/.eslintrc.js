/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 module.exports = {
    extends: [
        "@fluidframework/eslint-config-fluid",
    ],
    rules: {
        "@typescript-eslint/consistent-type-assertions": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-case-declarations": "off",
        "no-null/no-null": "off"
    }
}