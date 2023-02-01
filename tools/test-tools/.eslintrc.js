/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	settings: {
		"import/resolver": "node",
	},
	rules: {
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"import/no-nodejs-modules": "off",
		"unicorn/no-process-exit": "off",
		"unicorn/prefer-node-protocol": "off",
	},
};
