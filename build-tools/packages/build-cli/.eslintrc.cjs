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
		require.resolve("@fluidframework/eslint-config-fluid/recommended"),
		"prettier",
	],
	rules: {
		// This rule is often triggered when using custom Flags, so disabling.
		"object-shorthand": "off",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",

		// oclif uses default exports for commands
		"import/no-default-export": "off",

		// This package uses interfaces and types that are not exposed directly by npm-check-updates.
		// We also call commands' run method directly in some cases, so these are all excluded.
		"import/no-internal-modules": [
			"error",
			{
				allow: ["npm-check-updates/build/src/types/**", "**/commands/**"],
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

		// Too strict for our needs
		"unicorn/filename-case": "off",

		// In commands, destructuring is useful in some places but makes others less legible, so consistency isn't preferred.
		"unicorn/consistent-destructuring": "off",

		// This package is currently CJS-only.
		"unicorn/prefer-module": "off",

		// Deprecated in 2018: https://eslint.org/blog/2018/11/jsdoc-end-of-life/
		"valid-jsdoc": "off",

		// Disable all perfectionist rules that are inherited from oclif's lint config.
		"perfectionist/sort-array-includes": "off",
		"perfectionist/sort-astro-attributes": "off",
		"perfectionist/sort-classes": "off",
		"perfectionist/sort-enums": "off",
		"perfectionist/sort-exports": "off",
		"perfectionist/sort-imports": "off",
		"perfectionist/sort-interfaces": "off",
		"perfectionist/sort-jsx-props": "off",
		"perfectionist/sort-maps": "off",
		"perfectionist/sort-named-exports": "off",
		"perfectionist/sort-named-imports": "off",
		"perfectionist/sort-object-types": "off",
		"perfectionist/sort-objects": "off",
		"perfectionist/sort-svelte-attributes": "off",
		"perfectionist/sort-union-types": "off",
		"perfectionist/sort-vue-attributes": "off",
	},
};
