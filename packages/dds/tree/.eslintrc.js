/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-namespace": "off",
		"@typescript-eslint/no-empty-interface": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^",
				varsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
	},
	overrides: [
		{
			files: ["src/test/**/*"],
			rules: {
				"@typescript-eslint/no-unused-vars": ["off"],
			},
		},
	],
};
