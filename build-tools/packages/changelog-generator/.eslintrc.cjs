/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	plugins: ["@typescript-eslint"],
	extends: [
		// eslint-disable-next-line node/no-extraneous-require
		require.resolve("@fluidframework/eslint-config-fluid/minimal"),
		"prettier",
	],
	rules: {
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
	},
};
