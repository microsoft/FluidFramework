/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * "Recommended" eslint configuration.
 *
 * This is the fluid-framework repository's default configuration.
 * Recommended for use production packages whose APIs we do not expect the majority of our customers to use directly.
 *
 * For packages whose APIs are intended for wide use, the "Strict" configuration should be used instead.
 */
module.exports = {
	extends: ["./minimal.js", "plugin:unicorn/recommended"],
	plugins: ["eslint-plugin-tsdoc"],
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

		// Rationale: Destructuring of `Array.entries()` in order to get the index variable results in a
		//            significant performance regression [node 14 x64].
		"unicorn/no-for-loop": "off",

		/**
		 * Disabled because we will lean on the formatter (i.e. prettier) to enforce indentation policy.
		 * @remarks This rule also directly conflicts with prettier's formatting of nested ternary expressions.
		 */
		"unicorn/no-nested-ternary": "off",

		/**
		 * Disabled due to the sheer number of false positives it detects, and because it is sometimes valuable to
		 * explicitly denote `undefined`.
		 */
		"unicorn/no-useless-undefined": "off",

		/**
		 * By default, this rule conflicts with our internal error code formats.
		 * Only enforce `_` separator consistency if any such separators appear in the number literal.
		 */
		"unicorn/numeric-separators-style": ["error", { onlyIfContainsSeparator: true }],

		/**
		 * "node:" imports are not supported prior to Node.js v16.
		 * TODO: re-enable this (remove override) once the repo has been updated to v16.
		 */
		"unicorn/prefer-node-protocol": "off",

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
		"jsdoc/require-description": ["error", { checkConstructors: false }],

		// #endregion
	},
	overrides: [
		{
			// Rules only for React files
			files: ["*.jsx", "*.tsx"],
			rules: {
				// Conflicts with best practices for various React hooks.
				"unicorn/consistent-function-scoping": "off",
			},
		},
		{
			// Rules only for type validation files
			files: ["**/types/*validate*Previous*.ts"],
			rules: {
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/no-unsafe-argument": "off",
			},
		},
	],
};
