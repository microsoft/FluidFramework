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
		// This is an example/test app; all its dependencies are dev dependencies so as not to pollute the lockfile
		// with prod dependencies that aren't actually shipped. So don't complain when importing from dev dependencies.
		"import/no-extraneous-dependencies": ["error", { devDependencies: true }],
	},
};
