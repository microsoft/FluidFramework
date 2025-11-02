/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated")],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import-x/no-extraneous-dependencies": "off",
	},
};
