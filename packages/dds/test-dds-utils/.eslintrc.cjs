/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// TODO: remove this override and fix violations
		"@typescript-eslint/strict-boolean-expressions": "off",

		// This package implements test utils to be run under Node.JS.
		"import-x/no-nodejs-modules": "off",

		"depend/ban-dependencies": [
			"error",
			{
				allowed: [
					// TODO: This package should use tinyexec or child_process directly instead of execa
					"execa",
				],
			},
		],
	},
};
