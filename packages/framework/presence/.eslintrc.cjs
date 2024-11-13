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
			"./src/test/core-interfaces/tsconfig.no-exactOptionalPropertyTypes.json",
		],
	},
	rules: {
		// The clarity of explicit index signatures is helpful in many places with this package.
		"@typescript-eslint/consistent-indexed-object-style": "off",

		// TODO: Reenable no-explicit-any once need with ValueDirectoryOrState is
		// understood. If `any` is still needed disable is on a per line basis.
		"@typescript-eslint/no-explicit-any": "off",
		"import/no-internal-modules": [
			"error",
			{
				"allow": [
					"@fluidframework/*/internal{,/**}",
					"*/index.js",
					"@fluidframework/presence/alpha",
				],
			},
		],
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"@typescript-eslint/no-explicit-any": "error",

				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert"] }],
			},
		},
	],
};
