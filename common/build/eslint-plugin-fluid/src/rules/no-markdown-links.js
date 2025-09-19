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
					// Filter to only JSDoc/TSDoc style block comments
					.filter((comment) => comment.type === "Block" && comment.value.startsWith("*"));

				for (const comment of comments) {
					const matches = comment.value.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
					for (const match of matches) {
						const [fullMatch, text, url] = match;
						const startIndex = comment.range[0] + comment.value.indexOf(fullMatch);
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
