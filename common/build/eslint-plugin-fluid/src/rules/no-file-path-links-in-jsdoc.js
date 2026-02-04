/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/**
 * File path links are not portable in the context of JSDoc/TSDoc comments.
 * For this reason, we disallow them in favor of links to stable, user-accessible resources (like GitHub URLs).
 * This rule enforces that file path links do not appear in `{@link}` tags in JSDoc/TSDoc comments.
 *
 * @remarks
 * Our separate rule, `no-markdown-links-in-jsdoc`, disallows Markdown link syntax in JSDoc/TSDoc comments.
 * File path links are allowed in `@privateRemarks` blocks since those are not part of the public API documentation.
 *
 * @typedef {import("eslint").Rule.RuleModule} RuleModule
 * @typedef {import('@microsoft/tsdoc').DocNode} DocNode
 * @typedef {import('@microsoft/tsdoc').DocPlainText} DocPlainText
 *
 * @typedef {{
 * 	startIndex: number;
 * 	endIndex: number;
 * }} FilePathLinkMatch
 */

const { fail } = require("node:assert");
const { TSDocParser } = require("@microsoft/tsdoc");

const parser = new TSDocParser();

/**
 * Gets the text range (start and end positions) for a DocNode.
 * @param {DocNode} node - The doc node to get the range for.
 * @returns {{start: number, end: number} | undefined} The text range, or undefined if not available.
 */
function getNodeRange(node) {
	// Try to get the range from the node's excerpt
	if (node.excerpt) {
		const textRange = node.excerpt.getContainingTextRange();
		return { start: textRange.pos, end: textRange.end };
	}

	// If no excerpt, try to get range from child nodes
	const childNodes = node.getChildNodes();
	if (childNodes.length === 0) {
		return undefined;
	}

	let minStart = Infinity;
	let maxEnd = -Infinity;

	for (const child of childNodes) {
		const childRange = getNodeRange(child);
		if (childRange) {
			minStart = Math.min(minStart, childRange.start);
			maxEnd = Math.max(maxEnd, childRange.end);
		}
	}

	if (minStart !== Infinity && maxEnd !== -Infinity) {
		return { start: minStart, end: maxEnd };
	}

	return undefined;
}

/**
 * Finds file path links in the given text within the specified range.
 * @param {string} text - The full comment text.
 * @param {{start: number, end: number}} range - The range to search within.
 * @returns {FilePathLinkMatch[]} The list of found file path links.
 */
function findFilePathLinksInRange(text, range) {
	const links = [];
	const rangeText = text.substring(range.start, range.end);

	// JSDoc/TSDoc link syntax: {@link target|text} or {@link target}
	// Find links where the `target` component is a file path (starts with `/`, `./`, or `../`)
	const matches = rangeText.matchAll(/{@link\s+(\/|\.\/|\.\.\/).*?}/g);
	for (const match of matches) {
		links.push({
			startIndex: range.start + match.index,
			endIndex: range.start + match.index + match[0].length,
		});
	}

	return links;
}

/**
 * Eslint rule to disallow file path link syntax in JSDoc/TSDoc comments.
 * File path links are allowed in `@privateRemarks` blocks.
 *
 * @type {RuleModule}
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
					const fullCommentText = `/**${comment.value}*/`;
					const parserContext = parser.parseString(fullCommentText);
					const parsedComment = parserContext.docComment;

					// Collect ranges to check (all blocks except privateRemarks)
					const rangesToCheck = [];

					// Check summary section
					const summaryRange = getNodeRange(parsedComment.summarySection);
					if (summaryRange) {
						rangesToCheck.push(summaryRange);
					}

					// Check all blocks except privateRemarks
					const blocksToCheck = [
						...parsedComment.customBlocks,
						...parsedComment.seeBlocks,
					];
					if (parsedComment.remarksBlock) {
						blocksToCheck.push(parsedComment.remarksBlock);
					}
					// Note: we intentionally skip parsedComment.privateRemarks to allow file path links there
					if (parsedComment.deprecatedBlock) {
						blocksToCheck.push(parsedComment.deprecatedBlock);
					}
					if (parsedComment.returnsBlock) {
						blocksToCheck.push(parsedComment.returnsBlock);
					}

					for (const block of blocksToCheck) {
						const blockRange = getNodeRange(block.content);
						if (blockRange) {
							rangesToCheck.push(blockRange);
						}
					}

					// Search for file path links in each range
					for (const range of rangesToCheck) {
						const links = findFilePathLinksInRange(fullCommentText, range);
						for (const link of links) {
							// Adjust indices: TSDoc parser adds "/**" at the start (3 chars),
							// but eslint's comment.range[0] points to the "/*" (not "/**"),
							// so we need to subtract 1 to account for the difference
							const startIndex = commentStartIndex + link.startIndex - 1;
							const endIndex = commentStartIndex + link.endIndex - 1;

							context.report({
								loc: {
									start: sourceCode.getLocFromIndex(startIndex),
									end: sourceCode.getLocFromIndex(endIndex),
								},
								messageId: "filePathLink",
							});
						}
					}
				}
			},
		};
	},
};
