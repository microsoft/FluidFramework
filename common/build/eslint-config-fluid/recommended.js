/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "./minimal.js",
        "plugin:unicorn/recommended",
        "plugin:editorconfig/all",
    ],
    "plugins": [
        "editorconfig",
        "eslint-plugin-tsdoc",
    ],
    "rules": {
        // RECOMMENDED RULES
        "@rushstack/no-new-null": "error",
        "no-empty": "error",
        "no-void": "error",
        "require-atomic-updates": "error",

        // This rule ensures that our Intellisense looks good by verifying the TSDoc syntax.
        "tsdoc/syntax": "error",

        // In some cases, type inference can be wrong, and this can cause a "flip-flop" of type changes in our
        // API documentation. For example, type inference might decide a function returns a concrete type
        // instead of an interface. This has no runtime impact, but would cause compilation problems.
        "@typescript-eslint/explicit-function-return-type": [
            "error",
            {
                "allowExpressions": false,
                "allowTypedFunctionExpressions": true,
                "allowHigherOrderFunctions": true,
                "allowDirectConstAssertionInArrowFunctions": true,
                "allowConciseArrowFunctionExpressionsStartingWithVoid": false,
            }
        ],
        "unicorn/empty-brace-spaces": "off",
        "unicorn/prevent-abbreviations": "off",
    },
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["**/*.{ts,tsx}"],
            "rules": {
                "editorconfig/indent": "off", // We use tsfmt for "official" formatting.
            }
        }
    ]
};

