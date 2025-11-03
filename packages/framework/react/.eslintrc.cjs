/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict")],
	rules: {
		// Many uses. Could be cleaned up at some point.
		"max-len": "off",
	},
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
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
