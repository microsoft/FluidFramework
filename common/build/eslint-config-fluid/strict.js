/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    "extends": [
        "./recommended.js"
    ],
    "overrides": [
        {
            // Rules only for TypeScript files
            "files": ["*.ts", "*.tsx"],
            "rules": {
                // STRICT RULES
                "@typescript-eslint/explicit-member-accessibility": [
                    "error",
                    {
                        accessibility: "explicit",
                        overrides: {
                            accessors: "explicit",
                            constructors: "no-public",
                            methods: "explicit",
                            properties: "explicit",
                            parameterProperties: "explicit"
                        }
                    },
                ],

                // Parameter properties can be confusing to those new to TypeScript as they are less explicit than other
                // ways of declaring and initializing class members.
                "@typescript-eslint/no-parameter-properties": [
                    "warn",
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
