/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended")],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: enable
		"max-len": "off", // Turning it off as we get rid of eslint-config-prettier
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**/*.ts"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": [
					"error",
					{ allow: ["node:assert", "node:crypto", "node:fs", "node:path"] },
				],
			},
		},
		{
			files: ["src/test/types/*"],
			rules: {
				"max-len": "off",
			},
		},
	],
};
