/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/explicit-function-return-type": "warn",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"prefer-arrow-callback": "off",
		"tsdoc/syntax": "off",
		"depend/ban-dependencies": [
			"error",
			{
				allowed: ["lodash"],
			},
		],
	},
};
