/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: ["./recommended.js"],
    overrides: [
        {
            // Rules only for TypeScript files
            files: ["*.ts", "*.tsx"],
            rules: {
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
                            parameterProperties: "explicit",
                        },
                    },
                ],

                // Parameter properties can be confusing to those new to TypeScript as they are less explicit than other
                // ways of declaring and initializing class members.
                "@typescript-eslint/no-parameter-properties": [
                    "warn",
                    {
                        allows: ["private", "private readonly", "public readonly", "readonly"],
                    },
                ],
            },
        },
    ],
};
