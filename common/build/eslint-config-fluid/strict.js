/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "./rushstack.js"
    ],
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                // STRICT RULES

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

                // Parameter properties are hard to understand for new TypeScript developers.
                "@typescript-eslint/no-parameter-properties": [
                    "error",
                    {
                        "allows": [
                            "private",
                            "private readonly",
                            "public readonly",
                            "readonly",
                        ]
                    },
                ],

                // Requires explicit typing for anything exported from a module. Explicit types for function return
                // values and arguments makes it clear to any calling code what is the module boundary's input and
                // output.
                "@typescript-eslint/explicit-module-boundary-types": "error",

                // Disallows assigning any to a variable, and assigning any[] to an array destructuring. Assigning an
                // any typed value to a variable can be hard to pick up on, particularly if it leaks in from an external
                // library.
                "@typescript-eslint/no-unsafe-assignment": "error",

                // Disallows calling any variable that is typed as any. The arguments to, and return value of calling an
                // any typed variable are not checked at all by TypeScript.
                "@typescript-eslint/no-unsafe-call": "error",

                // Disallows member access on any variable that is typed as any. The arguments to, and return value of
                // calling an any typed variable are not checked at all by TypeScript.
                "@typescript-eslint/no-unsafe-member-access": "error",
            }
        }
    ]
};
