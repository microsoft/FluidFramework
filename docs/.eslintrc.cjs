/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
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
	},
};
