/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
	plugins: ["@typescript-eslint"],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// TODO: Enable these ASAP
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",

		"@typescript-eslint/no-non-null-assertion": "error",

		// Catch unused variables in at lint time instead of compile time
		"@typescript-eslint/no-unused-vars": "error",

		"@typescript-eslint/switch-exhaustiveness-check": "error",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",
	},
};
