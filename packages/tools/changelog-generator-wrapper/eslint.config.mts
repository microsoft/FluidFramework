/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint"],
	extends: [
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid"),
		"prettier",
	],
	parserOptions: {
		project: "./tsconfig.lint.json",
	},
	rules: {
		// TODO: this package should really extend some base JS config, and not pull in TS-specific rules.
		// For now, TS rules are disabled below.
		"@typescript-eslint/no-require-imports": "off",
		"@typescript-eslint/no-var-requires": "off",
		"@typescript-eslint/explicit-function-return-type": "off",
		"unicorn/prefer-module": "off",
	},
};
