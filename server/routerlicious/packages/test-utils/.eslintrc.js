/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 // This is a workaround for https://github.com/eslint/eslint/issues/3458
// require("@fluidframework/eslint-config-fluid/patch/modern-module-resolution");

module.exports = {
"extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    rules: {
        "@typescript-eslint/consistent-type-assertions": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "no-case-declarations": "off",
    }
}
