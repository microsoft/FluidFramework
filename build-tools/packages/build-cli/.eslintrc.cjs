/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint"],
	extends: [
		"oclif",
		"oclif-typescript",
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid/minimal"),
		"prettier",
	],
	rules: {
		"@typescript-eslint/no-unused-vars": "warn",
		"unused-imports/no-unused-imports": "warn",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",

		// oclif uses default exports for commands
		"import/no-default-export": "off",

		// This package uses interfaces and types that are not exposed directly by oclif and npm-check-updates.
		// We also call commands' run method directly in some cases, so these are all excluded.
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					"@oclif/core/lib/interfaces",
					"npm-check-updates/build/src/types/**",
					"**/commands/**",
				],
			},
		],

		// Superseded by prettier and @trivago/prettier-plugin-sort-imports
		"import/order": "off",

		"jsdoc/multiline-blocks": [
			"error",
			{
				noSingleLineBlocks: true,
			},
		],

		// The default for this rule is 4, but 5 is better
		"max-params": ["warn", 5],

		// Causes issues with some versions of node
		"unicorn/prefer-node-protocol": "off",

		// Deprecated in 2018: https://eslint.org/blog/2018/11/jsdoc-end-of-life/
		"valid-jsdoc": "off",
	},
};
