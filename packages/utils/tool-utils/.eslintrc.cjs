/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// This package is intended to be used in node.js environments
		"import/no-nodejs-modules": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
