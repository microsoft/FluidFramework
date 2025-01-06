/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
		// There are a lot of intentional internal APIs leveraged here for simplicity. Skip common example rules:
		// "../../.eslintrc.cjs",
	],
	rules: {},
};
