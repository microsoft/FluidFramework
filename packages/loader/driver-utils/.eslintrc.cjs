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
				// Tests often use flexible types and anonymous functions; relax strict rules here only.
				"@typescript-eslint/explicit-function-return-type": "off",
				"@typescript-eslint/explicit-module-boundary-types": "off",
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/no-unsafe-assignment": "off",
				"@typescript-eslint/no-unsafe-member-access": "off",
				"@typescript-eslint/no-unsafe-argument": "off",
				"@rushstack/no-new-null": "off",
				"jsdoc/require-description": "off",
				"no-empty": "off",
			},
		},
	],
};
