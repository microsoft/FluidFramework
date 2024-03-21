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
		"@typescript-eslint/strict-boolean-expressions": "off",
	},
	overrides: [
		{
			// The assertion shortcode map file is auto-generated, so disable some rules.
			files: ["src/assertionShortCodesMap.ts"],
			rules: {
				"@typescript-eslint/comma-dangle": "off",
			},
		},
		{
			files: ["src/test/**"],
			rules: {
				"import/no-nodejs-modules": "off",
			},
		},
	],
};
