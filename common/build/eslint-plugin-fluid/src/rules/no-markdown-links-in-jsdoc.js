/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-plugin-no-markdown-comments/lib/rules/no-markdown-links-in-comments.js
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow Markdown link syntax in comments",
			category: "Best Practices",
			recommended: false,
		},
		messages: {
			markdownLink:
				"Markdown link syntax (`[text](url)`) is not allowed in JSDoc/TSDoc comments. Use `{@link url|text}` syntax instead.",
		},
		fixable: "code",
		schema: [],
	},

	create(context) {
		return {
			Program() {
				const sourceCode = context.getSourceCode();
				const comments = sourceCode
					.getAllComments()
					// Filter to only JSDoc/TSDoc style block comments.
					// `getAllComments` returns the body of the block comments only (i.e. without the leading `/*` and trailing `*/`).
					// To filter only to JSDoc/TSDoc style comments (which start with `/**`), we check that the body starts with "*".
					.filter((comment) => comment.type === "Block" && comment.value.startsWith("*"));

				for (const comment of comments) {
					// +2 for the leading "/*", which is omitted by `comment.value`, but included in `comment.range`.
					const commentStartIndex = comment.range[0] + 2;

					const matches = comment.value.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
					for (const match of matches) {
						const [fullMatch, text, url] = match;

						const startIndex = commentStartIndex + match.index;
						const endIndex = startIndex + fullMatch.length;

						context.report({
							loc: {
								start: sourceCode.getLocFromIndex(startIndex),
								end: sourceCode.getLocFromIndex(endIndex),
							},
							messageId: "markdownLink",
							fix(fixer) {
								const trimmedText = text?.trim();
								const tsdocLink = trimmedText
									? `{@link ${url} | ${trimmedText}}`
									: `{@link ${url}}`;
								return fixer.replaceTextRange([startIndex, endIndex], tsdocLink);
							},
						});
					}
				}
			},
		};
	},
};
