/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict")],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
	overrides: [
		{
			files: ["src/test/types/*"],
			rules: {
				"max-len": "off",
			},
		},
	],
};
