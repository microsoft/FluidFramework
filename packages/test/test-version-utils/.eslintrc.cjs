/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import/no-deprecated": "off", // This package tests deprecated DDSes like SparseMatrix
		"import/no-nodejs-modules": "off",
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
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
};
