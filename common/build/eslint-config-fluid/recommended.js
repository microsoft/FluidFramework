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
	env: {
		browser: true,
		es6: true,
		es2024: false,
		node: true,
	},
	extends: ["./minimal-deprecated.js", "plugin:unicorn/recommended"],
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
				allowExpressions: true,
				allowTypedFunctionExpressions: true,
				allowHigherOrderFunctions: true,
				allowDirectConstAssertionInArrowFunctions: true,
				allowConciseArrowFunctionExpressionsStartingWithVoid: false,
			},
		],

		"unicorn/empty-brace-spaces": "off",

		// Rationale: Destructuring of `Array.entries()` in order to get the index variable results in a
		// significant performance regression [node 14 x64].
		"unicorn/no-for-loop": "off",

		/**
		 * Disabled because we will lean on the formatter (i.e. prettier) to enforce indentation policy.
		 * @remarks This rule also directly conflicts with prettier's formatting of nested ternary expressions.
		 */
		"unicorn/no-nested-ternary": "off",

		/**
		 * Disabled due to false positives / disruptive behavior of auto-fix.
		 * See {@link https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2018}.
		 * We may consider re-enabling once the above issue has been resolved.
		 */
		"unicorn/no-useless-spread": "off",

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

		"unicorn/prevent-abbreviations": "off",

		/**
		 * Disabled because we don't yet target a ES version that includes .at().
		 */
		"unicorn/prefer-at": "off",

		/**
		 * Disabled because we use EventEmitter everywhere today and changing it will be a bigger change outside of lint
		 * rules.
		 */
		"unicorn/prefer-event-target": "off",

		/**
		 * Disabled because we don't yet target a ES version that includes string.replaceAll.
		 */
		"unicorn/prefer-string-replace-all": "off",

		/**
		 * Disabled because we will lean on the formatter (i.e. prettier) to enforce indentation policy.
		 */
		"unicorn/template-indent": "off",

		/**
		 * Disabled because it is incompatible with prettier.
		 */
		"unicorn/number-literal-case": "off",

		/**
		 * The rule seems to crash on some of our code
		 */
		"unicorn/expiring-todo-comments": "off",

		/**
		 * Disallows the `any` type.
		 * Using the `any` type defeats the purpose of using TypeScript.
		 * When `any` is used, all compiler type checks around that value are ignored.
		 *
		 * @see https://typescript-eslint.io/rules/no-explicit-any
		 */
		"@typescript-eslint/no-explicit-any": [
			"error",
			{
				/**
				 * For certain cases, like rest parameters, any is required to allow arbitrary argument types.
				 * @see https://typescript-eslint.io/rules/no-explicit-any/#ignorerestargs
				 */
				ignoreRestArgs: true,
			},
		],

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
			// Rules for test code
			files: [
				"*.spec.ts",
				"*.test.ts",
				"**/test/**",
				// TODO: consider unifying code across the repo to use "test" and not "tests", then we can remove this.
				"**/tests/**",
			],
			rules: {
				// Does not work well with describe/it block scoping
				"unicorn/consistent-function-scoping": "off",

				// We run most of our tests in a Node.js environment, so this rule is not important and makes
				// file-system logic more cumbersome.
				"unicorn/prefer-module": "off",
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
