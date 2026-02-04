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
 * @typedef {import('@microsoft/tsdoc').DocExcerpt} DocExcerpt
 * @typedef {import('@microsoft/tsdoc').DocInlineTag} DocInlineTag
 * @typedef {import('@microsoft/tsdoc').DocNode} DocNode
 * @typedef {import('@microsoft/tsdoc').DocPlainText} DocPlainText
 * @typedef {import("eslint").Rule.RuleModule} RuleModule
 *
 * @typedef {{
 * 	startIndex: number;
 * 	endIndex: number;
 * }} TextRange
 */

const { fail } = require("node:assert");
const { DocNodeKind, TSDocParser } = require("@microsoft/tsdoc");
const { getBlockComments } = require("./tsdoc-utils");

const parser = new TSDocParser();

/**
 * Checks if a link target is a file path (starts with `/`, `./`, or `../`).
 * @param {string} linkTarget - The link target to check.
 * @returns {boolean} True if the link target is a file path.
 */
function isFilePath(linkTarget) {
	// Remove any pipe separator and text after it (e.g., "./path|text" -> "./path")
	const target = linkTarget.split("|")[0].trim();
	return target.startsWith("/") || target.startsWith("./") || target.startsWith("../");
}

/**
 * Recursively collects all Excerpt ranges from a DocNode tree.
 * @remarks Used to determine the full text range of an InlineTag node.
 * @param {DocNode} node - The node to collect ranges from.
 * @param {number} startIndex - The current minimum start position.
 * @param {number} endIndex - The current maximum end position.
 * @returns {TextRange} The updated start/end positions.
 */
function collectExcerptRanges(node, startIndex, endIndex) {
	if (node.kind === DocNodeKind.Excerpt) {
		const excerpt = /** @type {DocExcerpt} */ (node);
		if (excerpt.content) {
			const range = excerpt.content.getContainingTextRange();
			startIndex = Math.min(startIndex, range.pos);
			endIndex = Math.max(endIndex, range.end);
		}
	}

	// Recurse into children
	const children = node.getChildNodes();
	for (const child of children) {
		const result = collectExcerptRanges(child, startIndex, endIndex);
		startIndex = result.startIndex;
		endIndex = result.endIndex;
	}

	return { startIndex, endIndex };
}

/**
 * Gets the text range for an InlineTag node (which represents a {@link} tag).
 * @param {DocInlineTag} inlineTagNode - The inline tag node.
 * @returns {TextRange | undefined} The text range, or `undefined` if the tag has no content.
 */
function getInlineTagRange(inlineTagNode) {
	const { startIndex, endIndex } = collectExcerptRanges(inlineTagNode, Infinity, -Infinity);

	if (startIndex !== Infinity && endIndex !== -Infinity) {
		return { startIndex, endIndex };
	}

	return undefined;
}

/**
 * Finds instances of file path links within the provided DocNode tree.
 * @param {DocNode} node - The doc node to search.
 * @returns {TextRange[]} The list of found file path links.
 */
function findFilePathLinks(node) {
	/** @type {TextRange[]} */
	const links = [];

	// Check if this is an InlineTag (which represents a {@link} tag)
	if (node.kind === DocNodeKind.InlineTag) {
		const inlineTag = /** @type {DocInlineTag} */ (node);

		// Check if this is a @link tag with a file path target
		if (
			inlineTag.tagName === "@link" &&
			inlineTag.tagContent.length > 0 &&
			isFilePath(inlineTag.tagContent)
		) {
			// Get the text range for the entire InlineTag.
			// This is the range we will report to eslint.
			const range = getInlineTagRange(inlineTag);
			if (range) {
				links.push(range);
			}
		}
		// Don't recurse into InlineTag children - getInlineTagRange already walked them
		return links;
	}

	// Recurse into child nodes
	const childNodes = node.getChildNodes();
	for (const childNode of childNodes) {
		links.push(...findFilePathLinks(childNode));
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

					// Collect nodes to check (all blocks except privateRemarks)
					const nodesToCheck = [];

					// Check summary section
					nodesToCheck.push(parsedComment.summarySection);

					// Check all blocks except privateRemarks (we exclude privateRemarks to allow file path links there)
					const blocksToCheck = getBlockComments(parsedComment, {
						exclude: ["@privateRemarks"],
					});
					for (const block of blocksToCheck) {
						nodesToCheck.push(block.content);
					}

					// Search for file path links in each node
					for (const node of nodesToCheck) {
						const links = findFilePathLinks(node);
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
