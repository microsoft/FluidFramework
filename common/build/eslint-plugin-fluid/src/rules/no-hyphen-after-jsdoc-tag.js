/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/**
 * @typedef {import("eslint").Rule.RuleModule} RuleModule
 * @typedef {import('@microsoft/tsdoc').DocNode} DocNode
 * @typedef {import('@microsoft/tsdoc').DocPlainText} DocPlainText
 *
 * @typedef {{
 * 	startIndex: number; // Starting character index of the hyphen pattern (inclusive).
 * 	endIndex: number; // Ending character index of the hyphen pattern (exclusive).
 * }} HyphenPatternMatch
 */

const { fail } = require("node:assert");
const { DocNodeKind, TSDocParser } = require("@microsoft/tsdoc");

const parser = new TSDocParser();

/**
 * Checks if a comment text starts with a hyphen.
 * @param {DocPlainText} plainTextNode - The plain text node to check.
 * @return {HyphenPatternMatch | undefined} The hyphen pattern match info if found; otherwise, undefined.
 */
function doesTextNodeStartWithHyphen(plainTextNode) {
	// RegEx explanation:
	// ^\s*    - Match the start of the string, followed by zero or more whitespace characters
	// -       - Match the `-` character literal
	// \s*     - Match zero or more whitespace characters
	const match = plainTextNode.text.match(/^\s*-\s*/);

	if (!match) {
		return undefined;
	}

	const textRange =
		plainTextNode.textExcerpt?.getContainingTextRange() ??
		fail("Expected textExcerpt to be defined.");
	return {
		startIndex: textRange.pos,
		endIndex: textRange.pos + match[0].length,
	};
}

/**
 * Checks if a comment body starts with a hyphen.
 * @param { DocNode } commentBodyNode - The doc node representing the body of the comment.
 * @return {HyphenPatternMatch | undefined} The hyphen pattern match info if found; otherwise, undefined.
 */
function doesCommentBodyStartWithHyphen(commentBodyNode) {
	// Walk down first node of the tree until we find a leaf.
	// If it's plain text, and starts with a hyphen, return true.
	// Otherwise, return false.
	if (commentBodyNode.kind === DocNodeKind.PlainText) {
		return doesTextNodeStartWithHyphen(/** @type {DocPlainText} */ (commentBodyNode));
	}

	const childNodes = commentBodyNode.getChildNodes();
	if (childNodes.length === 0) {
		return undefined;
	}

	return doesCommentBodyStartWithHyphen(childNodes[0]);
}

/**
 * JSDoc/TSDoc tags do not require a hyphen after them.
 * @type {RuleModule}
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow hyphen character immediately following JSDoc/TSDoc block tag",
			category: "Best Practices",
			recommended: false,
		},
		messages: {
			hyphenAfterTag:
				"JSDoc/TSDoc block tags must not be followed by a hyphen character (`-`).",
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
					if (comment.range === undefined) {
						continue;
					}

					const commentStartIndex = comment.range[0];

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

					// Note: the TSDoc format makes it difficult to extract the range information for the block content specifically.
					// Instead, we just report the range for the tag itself.
					for (const block of blocksToCheck) {
						const hyphenMatch = doesCommentBodyStartWithHyphen(block.content);
						if (hyphenMatch) {
							const startIndex = commentStartIndex + hyphenMatch.startIndex - 1;
							const endIndex = commentStartIndex + hyphenMatch.endIndex - 1;

							context.report({
								loc: {
									start: sourceCode.getLocFromIndex(startIndex),
									end: sourceCode.getLocFromIndex(endIndex),
								},
								messageId: "hyphenAfterTag",
								fix(fixer) {
									return fixer.replaceTextRange([startIndex, endIndex], " ");
								},
							});
						}
					}
				}
			},
		};
	},
};

module.exports = rule;
