/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"no-bitwise": "off",
		"prefer-rest-params": "off",
		"unicorn/no-useless-undefined": "off", // Remove once this has been disabled in shared config
	},
};
