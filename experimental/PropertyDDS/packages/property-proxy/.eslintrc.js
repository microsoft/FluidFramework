/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        require.resolve("@fluidframework/eslint-config-fluid")
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "rules": {
        // Many rules are disabled in PropertyDDS projects. See https://github.com/microsoft/FluidFramework/pull/10272
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/restrict-plus-operands": "off",
        "prefer-arrow-callback": "off",
        "prefer-rest-params": "off",
        "tsdoc/syntax": "off",
    }
}
