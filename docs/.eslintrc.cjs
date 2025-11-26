/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	parserOptions: {
		ecmaVersion: "2022",
	},
	overrides: [
		// Rules for code
		{
			files: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
			extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
			parserOptions: {
				project: ["./tsconfig.json"],
			},
			settings: {
				react: {
					version: "detect",
				},
			},
			rules: {
				// Required by Docusaurus for certain component exports.
				"import/no-default-export": "off",

				"import/no-unassigned-import": [
					"error",
					{
						// Allow unassigned imports of css files.
						allow: ["**/*.css"],
					},
				],

				"import/no-internal-modules": [
					"error",
					{
						allow: ["@docusaurus/**", "@site/**", "@theme/**"],
					},
				],

				"import/no-unresolved": [
					"error",
					{
						ignore: ["^@docusaurus/", "^@theme/", "^@theme-original/"],
					},
				],

				// All dependencies in this package are dev
				"import/no-extraneous-dependencies": [
					"error",
					{
						devDependencies: true,
					},
				],

				// Unfortunately, some of the import aliases supported by Docusaurus are not recognized by TSC / the eslint parser.
				// So we have to disable some rules that enforce strong typing.
				// Could be worth investigating if there's a way to make TSC aware of how the aliases are resolved, but until then,
				// these rules are disabled.
				"@typescript-eslint/no-unsafe-argument": "off",
				"@typescript-eslint/no-unsafe-assignment": "off",
				"@typescript-eslint/no-unsafe-call": "off",
				"@typescript-eslint/no-unsafe-member-access": "off",
			},
			overrides: [
				{
					// Test file rule overrides
					files: ["test/**/*"],
					parserOptions: {
						project: ["./test/tsconfig.json"],
					},
				},
				{
					// Config file tool overrides
					files: ["docusaurus.config.ts", "playwright.config.ts", "infra/**/*"],
					rules: {
						"import/no-internal-modules": "off",
					},
				},
			],
		},

		// Rules for .md/.mdx documents
		{
			files: ["**/*.md", "**/*.mdx"],
			// TODO: extend prettier plugin, once prettier supports MDX v3.
			// See <https://github.com/prettier/prettier/issues/12209>
			extends: ["plugin:mdx/recommended"],
			plugins: ["@docusaurus/eslint-plugin"],
			rules: {
				// See <https://docusaurus.io/docs/api/misc/@docusaurus/eslint-plugin/no-html-links>
				"@docusaurus/no-html-links": "error",

				// See <https://docusaurus.io/docs/api/misc/@docusaurus/eslint-plugin/prefer-docusaurus-heading>
				"@docusaurus/prefer-docusaurus-heading": "error",
			},
		},
	],
};
