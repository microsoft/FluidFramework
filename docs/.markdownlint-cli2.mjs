/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// markdownlint-cli2 configuration for the `docs` workspace.
//
// See https://github.com/DavidAnson/markdownlint-cli2#configuration for the schema and
// https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md for the rules.

import relativeLinksRule from "markdownlint-rule-relative-links";

export default {
	config: {
		// Enable markdownlint's default rule set. See the full list of rules:
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md
		"default": true,

		// The first line of a document does not need to be a top-level heading.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md041.md
		"first-line-heading": false,

		// Prose is not hard-wrapped; line length is enforced by Prettier where applicable.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md013.md
		"line-length": false,

		// HTML is permitted in Markdown (used for anchors, details/summary, etc.).
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md033.md
		"no-inline-html": false,

		// Allow up to two consecutive blank lines.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md012.md
		"no-multiple-blanks": { maximum: 2 },

		// ul-indent (MD007): List indentation is owned by Prettier, which aligns nested list
		// content with the parent marker. Leaving this enabled conflicts with Prettier's output.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md007.md
		"ul-indent": false,

		// no-hard-tabs (MD010): Hard tabs — the repo uses tabs for indentation.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md010.md
		"no-hard-tabs": false,

		// no-duplicate-heading (MD024): Allow identical heading text under different parents
		// (e.g. repeated "Example" / "Guidance" sections). Only flag duplicate sibling headings.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md024.md
		"no-duplicate-heading": { siblings_only: true },

		// single-title (MD025): Multiple top-level headings — allowed.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md025.md
		"single-title": false,

		// no-trailing-punctuation (MD026): Trailing punctuation in heading — allowed.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md026.md
		"no-trailing-punctuation": false,

		// no-blanks-blockquote (MD028): Blank line inside blockquote — allowed.
		// https://github.com/DavidAnson/markdownlint/blob/main/doc/md028.md
		"no-blanks-blockquote": false,

		// relative-links (custom rule): flag relative file/image links that do not resolve on
		// disk, including invalid heading fragments in cross-file links. External URLs and
		// absolute paths are ignored.
		// https://github.com/theoludwig/markdownlint-rule-relative-links
		"relative-links": true,
	},
	// Custom rules loaded in addition to markdownlint's built-in rules.
	customRules: [relativeLinksRule],

	// Glob patterns ignored by markdownlint within this workspace.
	ignores: ["**/node_modules/**"],
};
