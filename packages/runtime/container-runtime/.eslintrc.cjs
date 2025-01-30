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
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: fix violations and remove overrides
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"require-atomic-updates": "warn",
		"unicorn/no-array-reduce": "warn",

		// False positives on non-array `push` methods.
		// TODO:AB#28686: remove this override once this rule has been disabled in the root config.
		"unicorn/no-array-push-push": "off",
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// TODO: remove these overrides and fix violations
				"@typescript-eslint/explicit-function-return-type": "warn",
				"unicorn/error-message": "warn",

				// Test files are run in node only so additional node libraries can be used.
				"import/no-nodejs-modules": ["error", { allow: ["node:assert", "node:crypto"] }],
			},
		},
	],
};
