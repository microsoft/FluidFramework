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
		"@typescript-eslint/strict-boolean-expressions": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// ESLint's resolver doesn't resolve relative imports of ESNext modules correctly, since
				// it resolves the path relative to the .ts file (and assumes a file with a .js extension
				// should exist there)
				"import/no-unresolved": ["error", { ignore: ["^\\.(.*)\\.js$"] }],
			},
		},
	],
};
