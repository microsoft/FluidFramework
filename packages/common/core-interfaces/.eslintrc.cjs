/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		project: [
			"./tsconfig.json",
			"./src/test/tsconfig.json",
			"./src/test/tsconfig.no-exactOptionalPropertyTypes.json",
		],
	},
	rules: {
		// TODO: Enabling this may require breaking changes.
		"@typescript-eslint/consistent-indexed-object-style": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"import/no-internal-modules": [
					"error",
					{
						"allow": ["@fluidframework/*/internal{,/**}"],
					},
				],
			},
		},
	],
};
