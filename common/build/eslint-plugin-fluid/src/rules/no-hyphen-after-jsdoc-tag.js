/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check

const { DocNode, DocNodeKind, TSDocParser, DocPlainText } = require("@microsoft/tsdoc");

const parser = new TSDocParser();

/**
 * Checks if a comment text starts with a hyphen.
 * @param {DocPlainText} commentBody - The plain text node to check.
 */
function doesTextNodeStartWithHyphen(commentBody) {
	return commentBody.text.trimStart().startsWith("-");
}

/**
 * Checks if a comment body starts with a hyphen.
 * @param { DocNode } commentBody - The doc section to check.
 */
function doesCommentBodyStartWithHyphen(commentBody) {
	// Walk down first node of the tree until we find a leaf.
	// If it's plain text, and starts with a hyphen, return true.
	// Otherwise, return false.
	if (commentBody.kind === DocNodeKind.PlainText) {
		// @ts-ignore
		return doesTextNodeStartWithHyphen(commentBody);
	}

	const childNodes = commentBody.getChildNodes();
	if (childNodes.length === 0) {
		return false;
	}

	return doesCommentBodyStartWithHyphen(childNodes[0]);
}

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
		schema: [],
	},

	// @ts-ignore
	create(context) {
		return {
			Program() {
				const sourceCode = context.getSourceCode();
				const comments = sourceCode
					.getAllComments()
					// Filter to only JSDoc/TSDoc style block comments
					// @ts-ignore
					.filter((comment) => comment.type === "Block" && comment.value.startsWith("*"));

				for (const comment of comments) {
					// +2 for the leading "/*", which is omitted by `comment.value`, but included in `comment.range`.
					const commentStartIndex = comment.range[0] + 2;

					// TSDoc parser requires the surrounding "/**" and "*/", but eslint strips those off in `comment.value`.
					const parserContext = parser.parseString(`/**${comment.value}*/`);
					const parsedComment = parserContext.docComment;

					const blocksToCheck = [
						...parsedComment.customBlocks,
						...parsedComment.seeBlocks,
					];
					if (parsedComment.remarksBlock) {
						blocksToCheck.push(parsedComment.remarksBlock);
					}
					if (parsedComment.privateRemarks) {
						blocksToCheck.push(parsedComment.privateRemarks);
					}
					if (parsedComment.deprecatedBlock) {
						blocksToCheck.push(parsedComment.deprecatedBlock);
					}
					if (parsedComment.returnsBlock) {
						blocksToCheck.push(parsedComment.returnsBlock);
					}

					for (const block of blocksToCheck) {
						if (doesCommentBodyStartWithHyphen(block.content)) {
							const startIndex = sourceCode.getLocFromIndex(commentStartIndex + parserContext.commentRange.pos);
							const endIndex = sourceCode.getLocFromIndex(commentStartIndex + parserContext.commentRange.end);
							context.report({
							loc: {
								start: startIndex,
								end: endIndex,
							},
							messageId: "hyphenAfterTag",
						});
						}
					}
				}
			},
		};
	},
};
