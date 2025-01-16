/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint", "chai-friendly"],
	extends: [
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid/recommended"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",

		"tsdoc/syntax": ["warn"],

		"import/no-internal-modules": [
			"error",
			{
				allow: ["@sinclair/typebox/*"],
			},
		],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files can import from anywhere
				"import/no-internal-modules": "off",

				// Superseded by chai-friendly/no-unused-expressions
				"no-unused-expressions": "off",
				"@typescript-eslint/no-unused-expressions": "off",

				"chai-friendly/no-unused-expressions": "error",
			},
		},
	],
};
