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
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// This rule is often triggered when using custom Flags, so disabling.
		"object-shorthand": "off",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",

		// oclif uses default exports for commands
		"import/no-default-export": "off",

		"import/no-internal-modules": [
			"error",
			{
				allow: [
					// fs-extra's ./esm export is needed for ESM support.
					"fs-extra/esm",

					// This package uses interfaces and types that are not exposed directly by npm-check-updates.
					"npm-check-updates/build/src/types/**",

					// We call oclif commands' run method directly in some cases, so these are all excluded.
					"**/commands/**",

					// These are all excluded because they're "submodules" used for organization.
					// AB#8118 tracks removing the barrel files and importing directly from the submodules.
					"**/library/index.js",
					"**/library/githubRest.js",
					"**/handlers/index.js",
					"**/machines/index.js",
					"**/repoPolicyCheck/index.js",
					"**/azureDevops/**",
					"**/codeCoverage/**",
					"azure-devops-node-api/**",
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

		// Too strict for our needs
		"unicorn/filename-case": "off",

		// In commands, destructuring is useful in some places but makes others less legible, so consistency isn't preferred.
		"unicorn/consistent-destructuring": "off",

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
		"perfectionist/sort-intersection-types": "off",
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
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "src/test/**"],
			rules: {
				// Test files can import from anywhere
				"import/no-internal-modules": "off",
			},
		},
	],
};
