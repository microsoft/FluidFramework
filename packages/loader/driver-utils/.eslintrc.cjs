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
		"import/no-nodejs-modules": ["error"],
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"import/no-nodejs-modules": "off", // Node libraries are OK for test files.
			},
		},
		{
			// Ignore dist and lib folders for linting
			files: ["dist/**", "lib/**"],
			rules: {},
		},
		{
			files: ["src/**/*.ts"],
			rules: {},
		},
	],
};
