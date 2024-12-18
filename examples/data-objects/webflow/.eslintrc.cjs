/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	importInternalModulesAllowed,
	importInternalModulesAllowedForTest,
} = require("../../.eslintrc.data.cjs");

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
		"../../.eslintrc.cjs",
	],
	rules: {
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/prefer-nullish-coalescing": "off", // requires strictNullChecks
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-internal-modules": [
			"error",
			{
				// package hasn't converted to barrel files (which may not be a bad thing)
				allow: importInternalModulesAllowed.concat(["*/*.js"]),
			},
		],
		"max-len": "off",
		"no-bitwise": "off",
		"no-case-declarations": "off",
	},
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	// This should not be needed. For some reason no overrides from "../../.eslintrc.cjs" come thru.
	overrides: [
		{
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				"import/no-internal-modules": [
					"error",
					{ allow: importInternalModulesAllowedForTest },
				],
			},
		},
	],
};
