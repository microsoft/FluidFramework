/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import/no-nodejs-modules": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"import/no-extraneous-dependencies": [
			"error",
			{
				// This package is only used to run its tests. It's ok for the src/utils.ts to import from devDependencies, in
				// addition to the test files
				devDependencies: ["src/utils.ts", "src/test/**"],
			},
		],
	},
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
