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
 * 	linkText: string;
 * 	linkTarget: string;
 * 	startIndex: number;
 * 	endIndex: number;
 * }} MarkdownLinkInfo
 */

const { fail } = require("node:assert");
const { DocNodeKind, TSDocParser } = require("@microsoft/tsdoc");

const parser = new TSDocParser();

/**
 * Checks if a comment text starts with a hyphen.
 * @param {DocPlainText} plainTextNode - The plain text node to check.
 * @returns {MarkdownLinkInfo[]}
 */
function findMarkdownLinksInPlainText(plainTextNode) {
	const textRange =
		plainTextNode.textExcerpt?.getContainingTextRange() ??
		fail("Expected textExcerpt to be defined.");
	const matches = plainTextNode.text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
	return Array.from(matches, (match) => ({
		linkText: match[1],
		linkTarget: match[2],
		startIndex: textRange.pos + match.index,
		endIndex: textRange.pos + match.index + match[0].length,
	}));
}

/**
 * Checks if a comment body starts with a hyphen.
 * @param { DocNode } commentBodyNode - The doc node representing the body of the comment.
 * @returns {MarkdownLinkInfo[]}
 */
function findMarkdownLinks(commentBodyNode) {
	// Walk down first node of the tree until we find a leaf.
	// If it's plain text, and starts with a hyphen, return true.
	// Otherwise, return false.
	if (commentBodyNode.kind === DocNodeKind.PlainText) {
		return findMarkdownLinksInPlainText(/** @type {DocPlainText} */ (commentBodyNode));
	}

	const childNodes = commentBodyNode.getChildNodes();

	const links = [];
	for (const childNode of childNodes) {
		links.push(...findMarkdownLinks(childNode));
	}
	return links;
}

/**
 * JSDoc/TSDoc tags do not require a hyphen after them.
 * @type {RuleModule}
 */
const rule = {
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

					/**
					 * @param {DocNode} node
					 * @returns {void}
					 */
					function checkCommentBlock(node) {
						const links = findMarkdownLinks(node);
						for (const link of links) {
							const startIndex = commentStartIndex + link.startIndex - 1;
							const endIndex = commentStartIndex + link.endIndex - 1;

							context.report({
								loc: {
									start: sourceCode.getLocFromIndex(startIndex),
									end: sourceCode.getLocFromIndex(endIndex),
								},
								messageId: "markdownLink",
								fix(fixer) {
								const trimmedText = link.linkText.trim();
								const tsdocLink = trimmedText
									? `{@link ${link.linkTarget} | ${trimmedText}}`
									: `{@link ${link.linkTarget}}`;
								return fixer.replaceTextRange([startIndex, endIndex], tsdocLink);
							},
							});
						}
					}

					// Note: the TSDoc format makes it difficult to extract the range information for the block content specifically.
					// Instead, we just report the range for the tag itself.
					checkCommentBlock(parsedComment.summarySection);
					for (const block of blocksToCheck) {
						checkCommentBlock(block.content);
					}
				}
			},
		};
	},
};

module.exports = rule;
