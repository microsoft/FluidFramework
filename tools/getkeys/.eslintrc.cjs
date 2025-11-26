/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.lint.json"],
	},
	settings: {
		"import/resolver": "node",
	},
	rules: {
		// TODO: this package should really extend some base JS config, and not pull in TS-specific rules.
		// For now, TS rules are disabled below.
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-nodejs-modules": "off",
		"promise/param-names": "off",
	},
};
