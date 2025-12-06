/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/recommended"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	overrides: [
		{
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// TODO: fix violations and enable
				"unicorn/consistent-function-scoping": "off",
			},
		},
	],
};
