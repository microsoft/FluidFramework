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
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/comma-spacing": "off",
        "@typescript-eslint/dot-notation": "off",
        "@typescript-eslint/no-dynamic-delete": "off",
        "@typescript-eslint/no-extraneous-class": "off",
        "@typescript-eslint/no-extraneous-dependencies": "off",
        "@typescript-eslint/no-implied-eval": "off",
        "@typescript-eslint/no-invalid-this": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-shadow": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/no-unused-expressions": "off",
        "@typescript-eslint/no-var-requires": "off",
        "@typescript-eslint/object-curly-spacing": "off",
        "@typescript-eslint/prefer-for-of": "off",
        "@typescript-eslint/prefer-optional-chain": "off",
        "@typescript-eslint/quotes": "off",
        "@typescript-eslint/restrict-plus-operands": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/unbound-method": "off",
        "guard-for-in": "off",
        "import/no-duplicates": "off",
        "import/no-internal-modules": "off",
        "max-len": "off",
        "no-bitwise": "off",
        "no-new-func": "off",
        "no-param-reassign": "off",
        "no-prototype-builtins": "off",
        "no-restricted-syntax": "off",
        "no-undef": "off",
        "no-undef-init": "off",
        "no-var": "off",
        "object-shorthand": "off",
        "one-var": "off",
        "prefer-arrow-callback": "off",
        "prefer-const": "off",
        "prefer-object-spread": "off",
        "prefer-template": "off",
        "quote-props": "off",
        "tsdoc/syntax": "off",
        "unicorn/better-regex": "off",
        "unicorn/no-unsafe-regex": "off"
    }
}
