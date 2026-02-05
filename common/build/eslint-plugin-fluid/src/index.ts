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

import type { Rule } from "eslint";
import noHyphenAfterJsdocTag = require("./rules/no-hyphen-after-jsdoc-tag.js");
import noFilePathLinksInJsdoc = require("./rules/no-file-path-links-in-jsdoc.js");
import noMarkdownLinksInJsdoc = require("./rules/no-markdown-links-in-jsdoc.js");
import noMemberReleaseTags = require("./rules/no-member-release-tags.js");
import noRestrictedTagsImports = require("./rules/no-restricted-tags-imports.js");
import noUncheckedRecordAccess = require("./rules/no-unchecked-record-access.js");

interface PluginExport {
	rules: {
		[key: string]: Rule.RuleModule;
	};
}

const plugin: PluginExport = {
	rules: {
		/**
		 * Disallow `-` following JSDoc/TSDoc tags.
		 * Full name: "@fluid-internal/fluid/no-hyphen-after-jsdoc-tag"
		 */
		"no-hyphen-after-jsdoc-tag": noHyphenAfterJsdocTag,

		/**
		 * Disallow file path links in JSDoc/TSDoc comments.
		 * Full name: "@fluid-internal/fluid/no-file-path-links-in-jsdoc"
		 */
		"no-file-path-links-in-jsdoc": noFilePathLinksInJsdoc,

		/**
		 * Disallow Markdown link syntax in JSDoc/TSDoc comments.
		 * Full name: "@fluid-internal/fluid/no-markdown-links-in-jsdoc"
		 */
		"no-markdown-links-in-jsdoc": noMarkdownLinksInJsdoc,

		/**
		 * Full name: "@fluid-internal/fluid/no-member-release-tags"
		 */
		"no-member-release-tags": noMemberReleaseTags,

		"no-restricted-tags-imports": noRestrictedTagsImports,
		"no-unchecked-record-access": noUncheckedRecordAccess,
	},
};

export = plugin;
