/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict")],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// A lot of long lines. Since this package is not under active development anymore, not worth addressing.
		"max-len": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files can import from submodules for testing purposes
				"import/no-internal-modules": [
					"error",
					{
						allow: ["*/index.js"],
					},
				],
			},
		},
	],
};
