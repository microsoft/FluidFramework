/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { forEachLine, getLineMetadata } = require("markdownlint-rule-helpers");

const excludedTypography = [
	["’", "'"],
	["“", '"'],
	["”", '"'],
	["–", "-"],
];

const excludedWords = ["Azure Fluid Relay service", "Azure Relay Service", "FRS", "`Tinylicious`"];

const clamp = (number, min, max) => {
	return Math.max(min, Math.min(number, max));
};

const extractContext = (line, column) => {
	const contextPadding = 10;
	return line.substr(clamp(column - contextPadding, 0, line.length - 1), contextPadding * 2);
};

module.exports = {
	customRules: [
		// "markdownlint-rule-emphasis-style",
		"markdownlint-rule-github-internal-links",
		{
			names: ["ban-words"],
			description: "Using a banned word",
			tags: ["style"],
			function: (params, onError) => {
				forEachLine(getLineMetadata(params), (line, lineIndex) => {
					for (const word of excludedWords) {
						const column = line.indexOf(word);
						if (column >= 0) {
							onError({
								lineNumber: lineIndex + 1,
								detail: `Found banned word "${word}" at column ${column}`,
								context: extractContext(line, column),
								range: [column + 1, 1],
							});
						}
					}
				});
			},
		},
		{
			names: ["proper-typography"],
			description: "Using improper typography",
			tags: ["style"],
			function: (params, onError) => {
				forEachLine(getLineMetadata(params), (line, lineIndex) => {
					for (const [character, replacement] of excludedTypography) {
						const column = line.indexOf(character);
						if (column >= 0) {
							onError({
								lineNumber: lineIndex + 1,
								detail: `Found invalid character "${character}" at column ${column}`,
								context: extractContext(line, column),
								range: [column + 1, 1],
								fixInfo: {
									lineNumber: lineIndex + 1,
									editColumn: column + 1,
									deleteCount: 1,
									insertText: replacement,
								},
							});
						}
					}
				});
			},
		},
	],
	config: {
		"code-block-style": {
			// MD046
			style: "fenced",
		},
		"code-fence-style": {
			// MD048
			style: "",
		},
		"emphasis-style": {
			// MD049
			style: "consistent",
		},
		"first-line-heading": {
			// MD041
			level: 2,
		},
		"github-internal-links": {
			// custom
			verbose: false,
		},
		"heading-style": {
			// MD003
			style: "atx",
		},
		"line-length": false, // MD013

		// We intentionally have unused reference links in a lot of pages, so this rule is disabled
		"link-image-reference-definitions": false, // MD053

		"list-marker-space": {
			// MD030
			ul_multi: 3,
			ul_single: 3,
		},
		"no-empty-links": true, // MD042
		"no-bare-urls": false, // MD034
		"no-hard-tabs": {
			// MD010
			code_blocks: false,
			spaces_per_tab: 2,
		},
		"no-inline-html": false, //MD033
		"no-multiple-blanks": {
			// MD012
			maximum: 2,
		},
		"no-trailing-spaces": {
			// MD009
			br_spaces: 0,
		},
		"proper-names": {
			// MD044
			code_blocks: false,
			names: [
				"Azure AD",
				"Azure Active Directory",
				"Azure Fluid Relay",
				"Fluid container",
				"Fluid containers",
				"Fluid Framework",
				"JavaScript",
				"JSON",
				"Microsoft",
				"npm",
				"Routerlicious",
				"Tinylicious",
				// Without the following entries, markdownlint incorrectly flags various correct usages of tinylicious.
				"tinylicious.md",
				"tinylicious-client",
			],
		},
		"reference-links-images": false, // MD052
		"ul-indent": {
			// MD007
			indent: 4,
		},
	},
	globs: ["content/**/*.md", "!content/docs/apis", "!node_modules"],
};
