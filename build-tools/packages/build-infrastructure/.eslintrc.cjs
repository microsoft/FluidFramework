/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["eslint:recommended", "plugin:@typescript-eslint/strict", "prettier"],
	plugins: ["@typescript-eslint"],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-unused-vars": "error",
		"@typescript-eslint/switch-exhaustiveness-check": "error",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",
	},
};
