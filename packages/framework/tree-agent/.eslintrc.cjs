/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
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
				// Test files can import from submodules for testing purposes
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
			},
		},
	],
};
