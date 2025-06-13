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
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/promise-function-async": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-internal-modules": "off",
		"import/no-nodejs-modules": "off",

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import/no-deprecated": "warn",
	},
};
