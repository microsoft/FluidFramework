/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Import the shared config from the root of the repo.
const sharedConfig = require("../../../knip.base.js");

module.exports = {
	include: [...sharedConfig.include],
	ignoreDependencies: [
		...sharedConfig.ignoreDependencies,

		// Oclif plugins are used dynamically at runtime.
		"@oclif/plugin-*",
		// Danger is used at runtime in the dangerfile.
		"danger",
		// Types from this package are used in markdown.ts.
		"mdast",
		// This is needed by the fluid-build task integration in policy-check.
		"tslib",
	],
};
