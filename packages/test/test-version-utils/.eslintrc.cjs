/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import-x/no-deprecated": "off", // This package tests deprecated DDSes like SparseMatrix
		"import-x/no-nodejs-modules": "off",
	},
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
};
