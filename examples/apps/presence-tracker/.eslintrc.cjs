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
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		"import/no-internal-modules": [
			"error",
			{
				allow: ["@fluidframework/presence/alpha", "fluid-framework/legacy"],
			},
		],
	},
};
