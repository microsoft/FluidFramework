/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-internal-modules": "off",
		"max-len": "off",
		"no-bitwise": "off",
		"no-case-declarations": "off",
		// ESLint's resolver doesn't resolve relative imports of ESNext modules correctly, since
		// it resolves the path relative to the .ts file (and assumes a file with a .js extension
		// should exist there)
		"import/no-unresolved": ["error", { ignore: ["^\\.(.*)\\.js$"] }],
	},
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
};
