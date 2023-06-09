/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import/no-nodejs-modules": "off",
		// ESLint's resolver doesn't resolve relative imports of ESNext modules correctly, since
		// it resolves the path relative to the .ts file (and assumes a file with a .js extension
		// should exist there)
		"import/no-unresolved": ["error", { ignore: ["^\\.(.*)\\.js$"] }],
	},
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
