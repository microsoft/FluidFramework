/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"import/no-internal-modules": [
			"error",
			{
				allow: ["/view/**"],
			},
		],
		// AB#18875
		"react/no-deprecated": "off",
	},
};
