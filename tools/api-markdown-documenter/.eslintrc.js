/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [
        require.resolve("@fluidframework/eslint-config-fluid/strict"),
        "plugin:chai-expect/recommended",
        "plugin:chai-friendly/recommended",
        "prettier",
    ],
    plugins: ["chai-expect", "chai-friendly"],
    parserOptions: {
        project: ["./tsconfig.json"],
    },
    rules: {
        /**
         * This package utilizes internals of api-documenter that are not exported by the package root.
         *
         * TODO: file issue to expose node types, etc. in main package so we don't need to do this, and have better
         * guarantees about support.
         */
        "import/no-internal-modules": [
            "error",
            {
                allow: ["@microsoft/api-documenter/**"],
            },
        ],

        "unicorn/prefer-module": "off",
        "unicorn/prefer-negative-index": "off",
        "unicorn/no-array-push-push": "off",

        // This package is exclusively used in a Node.js context
        "import/no-nodejs-modules": "off",

        // TODO: remove before merging
        "jsdoc/require-jsdoc": [
            "warn",
            {
                publicOnly: true,
                enableFixer: false,
                require: {
                    ArrowFunctionExpression: true,
                    ClassDeclaration: true,
                    ClassExpression: true,
                    FunctionDeclaration: true,
                    FunctionExpression: true,
                    MethodDefinition: false,
                },
                contexts: [
                    "TSEnumDeclaration",
                    "TSInterfaceDeclaration",
                    "TSTypeAliasDeclaration",
                    "VariableDeclaration",
                ],
            },
        ],
    },
    overrides: [
        {
            files: ["**/test/*"],
            rules: {
                "import/no-extraneous-dependencies": [
                    "error",
                    {
                        devDependencies: true,
                    },
                ],

                // Conflicts with chai expect patterns
                "@typescript-eslint/no-unused-expressions": "off",
            },
        },
    ],
};
