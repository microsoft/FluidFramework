/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "@fluidframework/eslint-config-fluid"
    ],
    "parserOptions": {
        "project": ["./tsconfig.json", "./src/test/tsconfig.json"]
    },
    "rules": {
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/dot-notation": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "eqeqeq": "off",
        "max-len": "off",
        "no-multi-spaces": "off",
        "no-var": "off",
        "prefer-const": "off",
        "unicorn/better-regex": "off",
        "unicorn/filename-case": "off"
    }
}
