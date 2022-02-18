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
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "import/no-duplicates": "off",
        "max-len": "off",
        "no-bitwise": "off",
        "no-var": "off",
        "prefer-const": "off",
        "unicorn/better-regex": "off",
        "unicorn/no-unsafe-regex": "off"
    }
}
