/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	settings: {
		"import/resolver": "node",
	},
	rules: {
		/**
		 * TODO: no-unsafe-* ts rules should be excluded for .js files
		 */
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-nodejs-modules": "off",
		"promise/param-names": "off",
	},
};
