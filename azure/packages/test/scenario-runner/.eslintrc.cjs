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
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import/no-nodejs-modules": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
};
