/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ESLint plugin for Fluid projects.
 *
 * @remarks
 * Refer to each rule by the unprefixed plugin name in the consumed package.
 * {@link https://eslint.org/docs/latest/extend/plugins#rules-in-plugins}
 */
module.exports = {
	rules: {
		/**
		 * Disallow file path links in JSDoc/TSDoc comments.
		 * Full name: "@fluid-internal/fluid/no-file-path-links-in-jsdoc"
		 */
		"no-file-path-links-in-jsdoc": require("./src/rules/no-file-path-links-in-jsdoc"),

		/**
		 * Disallow Markdown link syntax in JSDoc/TSDoc comments.
		 * Full name: "@fluid-internal/fluid/no-markdown-links-in-jsdoc"
		 */
		"no-markdown-links-in-jsdoc": require("./src/rules/no-markdown-links-in-jsdoc"),

		/**
		 * Full name: "@fluid-internal/fluid/no-member-release-tags"
		 */
		"no-member-release-tags": require("./src/rules/no-member-release-tags"),

		"no-restricted-tags-imports": require("./src/rules/no-restricted-tags-imports"),
		"no-unchecked-record-access": require("./src/rules/no-unchecked-record-access"),
	},
};
