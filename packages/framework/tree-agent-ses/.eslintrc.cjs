/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict")],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		// Allow reaching into FluidFramework package paths that end with alpha, beta, legacy, or internal
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					"@fluidframework/*/alpha",
					"@fluidframework/*/beta",
					"@fluidframework/*/legacy",
					"@fluidframework/*/internal",
				],
			},
		],
	},
	overrides: [
		{
			files: ["src/test/**/*"],
			parserOptions: {
				project: ["./src/test/tsconfig.json"],
			},
			rules: {
				"import/no-internal-modules": [
					"error",
					{
						allow: [
							"*/index.js",
							"@fluidframework/*/alpha",
							"@fluidframework/*/beta",
							"@fluidframework/*/legacy",
							"@fluidframework/*/internal",
						],
					},
				],
				"import/no-unresolved": "off",
				"@typescript-eslint/no-unsafe-assignment": "off",
				"@typescript-eslint/no-unsafe-call": "off",
				"@typescript-eslint/no-unsafe-member-access": "off",
				"@typescript-eslint/no-unsafe-return": "off",
				"@typescript-eslint/no-unsafe-argument": "off",
				"@typescript-eslint/strict-boolean-expressions": "off",
			},
		},
	],
};
