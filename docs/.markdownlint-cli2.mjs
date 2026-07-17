/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// markdownlint-cli2 configuration for the `docs` workspace.
//
// This file uses ESM (`.mjs`) because the `markdownlint-rule-relative-links` custom rule is
// published as an ES module. markdownlint-cli2 and the VS Code markdownlint extension both support
// `.markdownlint-cli2.mjs` config files.
//
// The rule set is intentionally inlined here for now. Once the shared
// `@fluidframework/build-common` markdownlint config lands in the client release group, this file
// should be updated to import and re-export that shared base so a single source of truth defines
// the rule set across the repo.
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
		// MD007 (ul-indent): List indentation is owned by Prettier, which aligns nested list
		// content with the parent marker. Leaving this enabled conflicts with Prettier's output.
		"MD007": false,
		// MD010: Hard tabs — the repo uses tabs for indentation.
		"MD010": false,
		// MD024 (no-duplicate-heading): Allow identical heading text under different parents
		// (e.g. repeated "Example" / "Guidance" sections). Only flag duplicate sibling headings.
		"MD024": { siblings_only: true },
		// MD025: Multiple top-level headings — allowed.
		"MD025": false,
		// MD026: Trailing punctuation in heading — allowed.
		"MD026": false,
		// MD028: Blank line inside blockquote — allowed.
		"MD028": false,
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
