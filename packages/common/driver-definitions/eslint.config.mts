/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	rules: {
		// TODO: Enabling this may require breaking changes.
		"@typescript-eslint/consistent-indexed-object-style": "off",
	},
};
