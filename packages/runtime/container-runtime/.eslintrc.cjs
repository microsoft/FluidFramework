/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		// False positives on non-array `push` methods.
		// TODO:AB#28686: remove this override once this rule has been disabled in the root config.
		"unicorn/no-array-push-push": "off",

		// #region TODO:AB#3027: remove overrides and upgrade config to `recommended`

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
		"@typescript-eslint/explicit-module-boundary-types": "error",
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
		"@typescript-eslint/no-unsafe-assignment": "error",
		"@typescript-eslint/no-unsafe-call": "error",
		"@typescript-eslint/no-unsafe-member-access": "error",
		"@typescript-eslint/no-unsafe-return": "error",

		"jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true }],
		"jsdoc/require-description": ["error", { checkConstructors: false }],

		"unicorn/catch-error-name": "error",
		"unicorn/consistent-destructuring": "error",
		"unicorn/consistent-function-scoping": "error",
		"unicorn/error-message": "error",
		"unicorn/new-for-builtins": "error",
		"unicorn/no-array-callback-reference": "error",
		"unicorn/no-array-for-each": "error",
		"unicorn/no-lonely-if": "error",
		"unicorn/no-new-array": "error",
		"unicorn/no-null": "error",
		"unicorn/no-zero-fractions": "error",
		"unicorn/prefer-includes": "error",
		"unicorn/prefer-node-protocol": "error",
		"unicorn/prefer-number-properties": "error",
		"unicorn/prefer-optional-catch-binding": "error",
		"unicorn/prefer-spread": "error",
		"unicorn/prefer-string-slice": "error",
		"unicorn/switch-case-braces": "error",
		"unicorn/throw-new-error": "error",

		// TODO:
		// unicorn/no-negated-condition
		// unicorn/explicit-length-check

		// #endregion
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// TODO: remove these overrides and fix violations
				"@typescript-eslint/explicit-function-return-type": "off",
				"unicorn/error-message": "warn",

				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert", "node:crypto"] }],

				// TODO:AB#3027: This rule is disabled for tests in the `recommended` base config.
				// Remove this override once the base has been updated.
				"unicorn/consistent-function-scoping": "off",
			},
		},
	],
};
