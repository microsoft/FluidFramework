/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	rules: {
		/**
		 * Full name: "@fluid-internal/fluid/no-member-release-tags"
		 *
		 * Refer to the rule by the unprefixed plugin name in the consumed package.
		 * {@link https://eslint.org/docs/latest/extend/plugins#rules-in-plugins}
		 */
		"no-member-release-tags": require("./src/rules/no-member-release-tags"),
		"no-restricted-tags-imports": require("./src/rules/no-restricted-tags-imports"),
		"no-unchecked-record-access": require("./src/rules/no-unchecked-record-access"),
	},
};
