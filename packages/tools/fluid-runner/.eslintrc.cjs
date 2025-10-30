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
		project: [
			"./tsconfig.json",
			"./tsconfig.bin.lint.json",
			"./src/test/tsconfig.json",
			"./src/test/tsconfig.cjs.lint.json",
		],
	},
	rules: {
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-nodejs-modules": "off",
		"unicorn/filename-case": [
			"error",
			{
				cases: {
					camelCase: true,
					pascalCase: true,
				},
				ignore: ["fluid-runner", "sample-executable"],
			},
		],

		// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
		"@typescript-eslint/consistent-type-exports": [
			"error",
			{ fixMixedExportsWithInlineTypeSpecifier: true },
		],
		"@typescript-eslint/consistent-type-imports": [
			"error",
			{ fixStyle: "inline-type-imports" },
		],
		"@typescript-eslint/no-import-type-side-effects": "error",
		// #endregion
	},
};
