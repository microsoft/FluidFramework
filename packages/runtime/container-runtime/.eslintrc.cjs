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

		// #region TODO:AB#3027: remove overrides and upgrade config to `recommended`

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
		"@typescript-eslint/no-unsafe-member-access": "error",
		"@typescript-eslint/no-unsafe-return": "error",

		"jsdoc/multiline-blocks": ["error", { noSingleLineBlocks: true }],
		"jsdoc/require-description": ["error", { checkConstructors: false }],

		// #endregion
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["assert", "crypto"] }],
			},
		},
	],
};
