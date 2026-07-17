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
		"default": true,
		// The first line of a document does not need to be a top-level heading.
		"first-line-heading": false,
		// Prose is not hard-wrapped; line length is enforced by Prettier where applicable.
		"line-length": false,
		// HTML is permitted in Markdown (used for anchors, details/summary, etc.).
		"no-inline-html": false,
		// Allow up to two consecutive blank lines.
		"no-multiple-blanks": { maximum: 2 },
		// ul-indent (MD007): List indentation is owned by Prettier, which aligns nested list
		// content with the parent marker. Leaving this enabled conflicts with Prettier's output.
		"ul-indent": false,
		// no-hard-tabs (MD010): Hard tabs — the repo uses tabs for indentation.
		"no-hard-tabs": false,
		// no-duplicate-heading (MD024): Allow identical heading text under different parents
		// (e.g. repeated "Example" / "Guidance" sections). Only flag duplicate sibling headings.
		"no-duplicate-heading": { siblings_only: true },
		// single-title (MD025): Multiple top-level headings — allowed.
		"single-title": false,
		// no-trailing-punctuation (MD026): Trailing punctuation in heading — allowed.
		"no-trailing-punctuation": false,
		// no-blanks-blockquote (MD028): Blank line inside blockquote — allowed.
		"no-blanks-blockquote": false,
		// relative-links (custom rule): flag relative file/image links that do not resolve on
		// disk, including invalid heading fragments in cross-file links. External URLs and
		// absolute paths are ignored.
		"relative-links": true,
	},
	// Custom rules loaded in addition to markdownlint's built-in rules.
	customRules: [relativeLinksRule],
	// Glob patterns ignored by markdownlint within this workspace.
	ignores: ["**/node_modules/**"],
};
