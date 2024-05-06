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
		"project": ["./tsconfig.json", "./src/test/tsconfig.json"],
		"promise/catch-or-return": ["error", { allowFinally: true }],

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",
	},
	rules: {
		// This package runs in node but also in the browser so we don't want it to import Node packages.
		"import/no-nodejs-modules": ["error"],
	},
	overrides: [
		{
			files: ["src/test/**/*.ts"],
			rules: {
				"import/no-nodejs-modules": "off",
			},
		},
	],
};
