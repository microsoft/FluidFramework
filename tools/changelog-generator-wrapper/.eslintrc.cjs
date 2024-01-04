/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint"],
	extends: [
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid/minimal"),
		"prettier",
	],
	rules: {
		"@typescript-eslint/no-require-imports": "off",
		"@typescript-eslint/no-var-requires": "off",
		"unicorn/prefer-module": "off",
	},
};
