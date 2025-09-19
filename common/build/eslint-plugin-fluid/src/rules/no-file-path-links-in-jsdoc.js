/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * File path links are not portable in the context of JSDoc/TSDoc comments.
 * For this reason, we disallow them in favor of links to stable, user-accessible resources (like GitHub URLs).
 * This rule enforces that file path links do not appear in `{@link}` tags in JSDoc/TSDoc comments.
 *
 * @remarks
 * Our separate rule, `no-markdown-links-in-jsdoc`, disallows Markdown link syntax in JSDoc/TSDoc comments.
 */
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow relative path link syntax in comments",
			category: "Best Practices",
			recommended: false,
		},
		messages: {
			filePathLink:
				"File path links are not allowed in JSDoc/TSDoc comments. Link to a stable, user-accessible resource (like an API reference or a GitHub URL) instead.",
		},
		schema: [],
	},

	create(context) {
		return {
			Program() {
				const sourceCode = context.getSourceCode();
				const comments = sourceCode
					.getAllComments()
					// Filter to only JSDoc/TSDoc style block comments
					.filter((comment) => comment.type === "Block" && comment.value.startsWith("*"));

				for (const comment of comments) {
					// JSDoc/TSDoc link syntax: {@link target|text} or {@link target}
					// Find links where the `target` component is a file path (starts with `/`, `./`, or `../`)
					const matches = comment.value.matchAll(/{@link\s+(\/|\.\/|\.\.\/).*}/g);
					for (const match of matches) {
						const startIndex = comment.range[0] + match.index;
						const endIndex = startIndex + match[0].length;

						context.report({
							loc: {
								start: sourceCode.getLocFromIndex(startIndex),
								end: sourceCode.getLocFromIndex(endIndex),
							},
							messageId: "filePathLink",
						});
					}
				}
			},
		};
	},
};
