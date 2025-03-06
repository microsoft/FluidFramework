/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: [
			"./tsconfig.json",
			"./src/test/mocha/tsconfig.json",
			"./src/test/jest/tsconfig.json",
			"./src/test/types/tsconfig.json",
		],
	},
	rules: {
		// The whole server release group is intended to run in NodeJS; this is fine
		"import/no-nodejs-modules": "off",

		// This package has been deprecated. The following rules have a significant number of violations
		// that will not be fixed here.
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/explicit-module-boundary-types": "off",
		"unicorn/text-encoding-identifier-case": "off",
		"unicorn/prefer-node-protocol": "off",
		"unicorn/prefer-code-point": "off",
	},
};
