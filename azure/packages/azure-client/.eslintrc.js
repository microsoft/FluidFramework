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
        // Require jsdoc/tsdoc comments on public/exported API items.
        "jsdoc/require-jsdoc": [
            "error",
            {
                // Indicates that only module exports should be flagged for lacking jsdoc comments
                publicOnly: true,
                enableFixer: false, // Prevents eslint from adding empty comment blocks when run with `--fix`
                require: {
                    ClassDeclaration: true,
                    FunctionDeclaration: true,

                    // Will report for *any* methods on exported classes, regardless of whether or not they are public
                    MethodDefinition: false,
                },
                contexts: ["TSEnumDeclaration", "TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
            },
        ],

        // Ensure jsdoc/tsdoc comments contain a main description component
        // (disallows empty comments / only tags).
        "jsdoc/require-description": ["error", { checkConstructors: false }],
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
