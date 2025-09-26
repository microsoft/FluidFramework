/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * JSDoc/TSDoc tags do not require a hyphen after them.
 */
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow hyphen character immediately following JSDoc tag",
			category: "Best Practices",
			recommended: false,
		},
		messages: {
			hyphenAfterTag:
				"JSDoc/TSDoc block tags should not be followed by a hyphen character ('-').",
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
					// Find any JSDoc/TSDoc tags followed by a hyphen
					const matches = comment.value.matchAll(/(@[a-zA-Z0-9]+)\s*?-(.*)/g);
					for (const match of matches) {
						const [fullMatch, tag, body] = match;

						const startIndex = comment.range[0] + match.index;
						const endIndex = startIndex + fullMatch.length;

						context.report({
							loc: {
								start: sourceCode.getLocFromIndex(startIndex),
								end: sourceCode.getLocFromIndex(endIndex),
							},
							messageId: "hyphenAfterTag",
							fix(fixer) {
								return fixer.replaceTextRange(
									[startIndex, endIndex],
									`${tag} ${body.trimStart()}`,
								);
							},
						});
					}
				}
			},
		};
	},
};
