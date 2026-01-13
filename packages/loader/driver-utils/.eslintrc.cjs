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
		"import-x/no-nodejs-modules": ["error"],
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		// Disabled because the rule is crashing on this package - AB#51780
		"@typescript-eslint/unbound-method": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"import-x/no-nodejs-modules": "off", // Node libraries are OK for test files.
			},
		},
	],
};
