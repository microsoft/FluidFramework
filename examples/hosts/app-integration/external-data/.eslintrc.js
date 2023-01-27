/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {},
	overrides: [
		{
			files: ["tests/*"],
			rules: {
				// Fine for tests to use node.js modules
				"import/no-nodejs-modules": "off",

				// Since the "tests" directory is adjacent to "src", and this package (intentionally) does not expose
				// a single exports roll-up, reaching into "src" is required.
				"import/no-internal-modules": "off",

				// Fine for tests to import from dev dependencies
				"import/no-extraneous-dependencies": ["error", { devDependencies: true }],
			},
		},
	],
};
