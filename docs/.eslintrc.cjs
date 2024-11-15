/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
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

		"import/no-extraneous-dependencies": [
			"error",
			{
				devDependencies: ["test/**"],
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
			// Test files
			files: ["test/**/*"],
			parserOptions: {
				project: ["./test/tsconfig.json"],
			},
		},
		{
			// Config files
			files: ["docusaurus.config.ts", "playwright.config.ts", "infra/**/*"],
			rules: {
				// Dev dependencies and internal modules may be used in config files
				"import/no-extraneous-dependencies": [
					"error",
					{
						devDependencies: true,
					},
				],
				"import/no-internal-modules": "off",
			},
		},
	],
};
