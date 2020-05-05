/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [
        "@microsoft/eslint-config-fluid",
    ],
    rules: {
        "@typescript-eslint/no-use-before-define": "off",
        "no-case-declarations": "off"
    }
}