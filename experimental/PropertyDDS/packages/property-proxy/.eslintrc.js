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
        // TODO(marcus): remove the linting issues
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/restrict-plus-operands": "off",
        "prefer-rest-params": "off"

    }
}
