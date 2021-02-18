/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid/eslint7"
    ],
    "rules": {
        "@typescript-eslint/no-shadow": "off",
        "space-before-function-paren": "off", // Off because it conflicts with typescript-formatter
    }
}
