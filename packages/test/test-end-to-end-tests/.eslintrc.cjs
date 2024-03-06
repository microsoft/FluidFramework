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
		project: ["./src/test/tsconfig.json"],
	},
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error"],
		"@typescript-eslint/no-restricted-imports": [
			"error",
			{
				paths: [
					"@fluidframework/cell",
					"@fluidframework/counter",
					"@fluidframework/map",
					"@fluidframework/matrix",
					"@fluidframework/ordered-collection",
					"@fluidframework/register-collection",
					"@fluidframework/sequence",
					"@fluid-experimental/sequence-deprecated",
				].map((importName) => ({
					name: importName,
					message:
						"Rather than import this Fluid package directly, use the 'apis' argument of describeCompat. See \"How-to\" in the README for more information.",
					allowTypeImports: true,
				})),
			},
		],

		// This rule causes linting to crash with a "Error: Circularity detected while resolving configuration: /common/build/build-common/tsconfig.base.json"
		"import/namespace": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["assert"] }],
			},
		},
		{
			files: ["src/test/benchmark/**"],
			rules: {
				// General guidance to avoid importing compat-provided APIs does not apply to the benchmark tests,
				// since they don't currently aim to test performance of mixed-versioned packages or cross-version
				// collaboration between clients.
				"@typescript-eslint/no-restricted-imports": "off",
			},
		},
	],
};
