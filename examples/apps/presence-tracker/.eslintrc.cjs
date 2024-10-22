/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	rules: {
		"import/no-internal-modules": [
			"error",
			{
				allow: [
					// IndependentMapFactory is internal
					"@fluid-experimental/*/internal",
					// Preserve the unfortunate use if internal in examples
					"@fluidframework/*/internal",
				],
			},
		],
	},
};
