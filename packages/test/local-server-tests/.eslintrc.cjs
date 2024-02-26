/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"import/no-nodejs-modules": "off",

		// This rule causes linting to crash with a "Error: Circularity detected while resolving configuration: /common/build/build-common/tsconfig.base.json"
		"import/namespace": "off",
	},
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
