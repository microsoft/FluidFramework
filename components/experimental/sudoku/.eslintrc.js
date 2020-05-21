/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid",
        "prettier/@typescript-eslint",
        "plugin:prettier/recommended"
    ],
    "rules": {
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "import/no-internal-modules": "off"
    }
}
