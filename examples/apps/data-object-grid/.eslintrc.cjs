/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
		"../../.eslintrc.cjs",
	],
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off", // Doing undefined checks is nice
		"@typescript-eslint/unbound-method": "off", // Used to do binding for react methods
		"import/no-unassigned-import": "off", // required for dynamically importing css files for react-grid-layout
	},
};
