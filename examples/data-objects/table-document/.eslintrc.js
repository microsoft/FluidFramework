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
		"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-deprecated": "off", // This package as a whole is deprecated so it uses deprecated APIs
	},
	settings: {
		"import/resolver": {
			// Use eslint-import-resolver-typescript.
			// This ensures ESNext with `.js` extensions resolve correctly to their corresponding `.ts` files.
			typescript: {
				extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			},
		},
	},
};
