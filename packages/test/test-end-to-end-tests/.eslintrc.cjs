/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error", { allow: ["url"] }],
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["assert", "url"] }],
				// ESLint's resolver doesn't resolve relative imports of ESNext modules correctly, since
				// it resolves the path relative to the .ts file (and assumes a file with a .js extension
				// should exist there)
				// AB#4614 tracks moving to eslint-import-resolver-typescript (which handles such imports
				// out of the box) and removing this exception.
				"import/no-unresolved": ["error", { ignore: ["^\\.(.*)\\.js$"] }],
			},
		},
	],
};
