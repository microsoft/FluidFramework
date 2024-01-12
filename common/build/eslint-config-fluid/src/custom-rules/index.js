/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Root of the export of Fluid's custom ESLint rules {@link eslint-plugin-fluid-custom-rules}.
 * Custom rules exported as a module which are then used as a dependency in {@link @fluidframework/eslint-config-fluid}.
 */
module.exports = {
	rules: {
		"no-member-release-tags": require("./rules/no-member-release-tags"),
		"no-restricted-tags-imports": require("./rules/no-restricted-tags-imports"),
	},
};
