/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
    plugins: ["eslint-plugin-jsdoc"],
    parserOptions: {
        project: ["./tsconfig.json", "./src/test/tsconfig.json"],
    },
    rules: {
        "import/no-unassigned-import": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",

        // Require jsdoc/tsdoc comments on public/exported API items.
        // TODO: remove once dependency on base config has been updated.
        "jsdoc/require-jsdoc": [
            "error",
            {
                // Indicates that only module exports should be flagged for lacking jsdoc comments
                publicOnly: true,
                enableFixer: false, // Prevents eslint from adding empty comment blocks when run with `--fix`
                require: {
                    ArrowFunctionExpression: true,
                    ClassDeclaration: true,
                    ClassExpression: true,
                    FunctionDeclaration: true,
                    FunctionExpression: true,

                    // Will report for *any* methods on exported classes, regardless of whether or not they are public
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

        // Ensure jsdoc/tsdoc comments contain a main description component
        // (disallows empty comments / only tags).
        "jsdoc/require-description": ["error", { checkConstructors: false }],

        // TODO: remove once dependency on base config has been updated.
        "@typescript-eslint/explicit-member-accessibility": [
            "error",
            {
                accessibility: "explicit",
                overrides: {
                    accessors: "explicit",
                    constructors: "explicit",
                    methods: "explicit",
                    properties: "explicit",
                    parameterProperties: "explicit",
                },
            },
        ],
    },
    overrides: [
        {
            files: ["packageVersion.ts"],
            rules: {
                "jsdoc/require-jsdoc": "off",
                "jsdoc/require-description": "off",
            },
        },
    ],
};
