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
		// This package is being deprecated, so it's okay to use deprecated APIs.
		"import/no-deprecated": "off",

		// This package uses node's events APIs.
		// This should probably be reconsidered, but until then we will leave an exception for it here.
		"import/no-nodejs-modules": ["error", { allow: ["events"] }],

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
	overrides: [
		{
			files: ["src/test/**/*"],
			rules: {
				// It's fine for tests to use node.js modules.
				"import/no-nodejs-modules": "off",
			},
		},
	],
};
