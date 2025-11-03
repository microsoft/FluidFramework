/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	extends: ["@fluidframework/eslint-config-fluid"],
	overrides: [
		{
			files: ["src/test/types/*"],
			rules: {
				"max-len": "off",
			},
		},
	],
};
