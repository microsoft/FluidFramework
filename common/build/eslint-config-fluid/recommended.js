/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: ["./minimal.js", "plugin:unicorn/recommended", "plugin:editorconfig/all"],
    plugins: ["editorconfig", "eslint-plugin-tsdoc"],
    rules: {
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
                allowExpressions: false,
                allowTypedFunctionExpressions: true,
                allowHigherOrderFunctions: true,
                allowDirectConstAssertionInArrowFunctions: true,
                allowConciseArrowFunctionExpressionsStartingWithVoid: false,
            },
        ],
        "unicorn/empty-brace-spaces": "off",
        "unicorn/prevent-abbreviations": "off",

        /**
         * Disallows the `any` type.
         * Using the `any` type defeats the purpose of using TypeScript.
         * When `any` is used, all compiler type checks around that value are ignored.
         */
        "@typescript-eslint/no-explicit-any": "error",

        /**
         * Requires explicit typing for anything exported from a module. Explicit types for function return
         * values and arguments makes it clear to any calling code what is the module boundary's input and
         * output.
         */
        "@typescript-eslint/explicit-module-boundary-types": "error",

        /**
         * Disallows calling a function with a value with type `any`.
         * Despite your best intentions, the `any` type can sometimes leak into your codebase.
         * Call a function with `any` typed argument are not checked at all by TypeScript, so it creates a
         * potential safety hole, and source of bugs in your codebase.
         */
        "@typescript-eslint/no-unsafe-argument": "error",

        /**
         * Disallows assigning any to a variable, and assigning any[] to an array destructuring. Assigning an
         * any typed value to a variable can be hard to pick up on, particularly if it leaks in from an external
         * library.
         */
        "@typescript-eslint/no-unsafe-assignment": "error",

        /**
         * Disallows calling any variable that is typed as any. The arguments to, and return value of calling an
         * any typed variable are not checked at all by TypeScript.
         */
        "@typescript-eslint/no-unsafe-call": "error",

        /**
         * Disallows member access on any variable that is typed as any. The arguments to, and return value of
         * calling an any typed variable are not checked at all by TypeScript.
         */
        "@typescript-eslint/no-unsafe-member-access": "error",

        /**
         * Disallows returning a value with type any from a function.
         *
         * Despite your best intentions, the any type can sometimes leak into your codebase.
         * Returned any typed values are not checked at all by TypeScript, so it creates a potential safety
         * hole, and source of bugs in your codebase.
         */
        "@typescript-eslint/no-unsafe-return": "error",

        // #region eslint-plugin-jsdoc rules

        /**
         * Ensures all JSDoc/TSDoc comments use the multi-line format for consistency.
         * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-multiline-blocks>
         */
        "jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true }],

        /**
         * Require the description (summary) component in JSDoc/TSDoc comments
         * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-description>
         */
        "jsdoc/require-description": "error",

        // #endregion
    },
    overrides: [
        {
            // Rules only for TypeScript files
            files: ["**/*.{ts,tsx}"],
            rules: {
                "editorconfig/indent": "off", // We use tsfmt for "official" formatting.
            },
        },
        {
            // Rules only for type validation files
            files: ["**/types/*validate*Previous.ts"],
            rules: {
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-unsafe-argument": "off",
            },
        },
    ],
};
