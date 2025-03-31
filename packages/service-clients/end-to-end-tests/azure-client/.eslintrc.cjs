/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "*.test.ts", "**/test/**"],
			rules: {
				// Some deprecated APIs are permissible in tests; use `warn` to keep them visible
				"import/no-deprecated": "warn",
			},
		},
	],
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
