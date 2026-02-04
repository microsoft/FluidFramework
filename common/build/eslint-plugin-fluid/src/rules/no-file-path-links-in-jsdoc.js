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
 * }} FilePathLinkMatch
 */

const { fail } = require("node:assert");
const { DocNodeKind, TSDocParser } = require("@microsoft/tsdoc");

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
 * Gets the text range for an InlineTag node (which represents a {@link} tag).
 * @param {DocInlineTag} inlineTagNode - The inline tag node.
 * @returns {{start: number, end: number} | undefined} The text range, or undefined if not available.
 */
function getInlineTagRange(inlineTagNode) {
	// Recursively collect all text ranges from Excerpt nodes within this InlineTag
	let minStart = Infinity;
	let maxEnd = -Infinity;

	/**
	 * Recursively walk the tree to find all Excerpt nodes
	 * @param {DocNode} node
	 */
	function collectExcerptRanges(node) {
		if (node.kind === DocNodeKind.Excerpt) {
			const excerpt = /** @type {DocExcerpt} */ (node);
			if (excerpt.content) {
				try {
					const range = excerpt.content.getContainingTextRange();
					minStart = Math.min(minStart, range.pos);
					maxEnd = Math.max(maxEnd, range.end);
				} catch (e) {
					// Ignore excerpts that don't have valid ranges
				}
			}
		}

		// Recurse into children
		const children = node.getChildNodes();
		for (const child of children) {
			collectExcerptRanges(child);
		}
	}

	collectExcerptRanges(inlineTagNode);

	if (minStart !== Infinity && maxEnd !== -Infinity) {
		return { start: minStart, end: maxEnd };
	}

	return undefined;
}

/**
 * Finds instances of file path links within the provided DocNode tree.
 * @param {DocNode} node - The doc node to search.
 * @returns {FilePathLinkMatch[]} The list of found file path links.
 */
function findFilePathLinks(node) {
	/** @type {FilePathLinkMatch[]} */
	const links = [];

	/**
	 * Recursively walk the node tree
	 * @param {DocNode} currentNode
	 */
	function walk(currentNode) {
		// Check if this is an InlineTag (which represents a {@link} tag)
		if (currentNode.kind === DocNodeKind.InlineTag) {
			/** @type {DocInlineTag} */
			const inlineTag = /** @type {any} */ (currentNode);

			// Check if this is a @link tag with a file path target
			if (inlineTag.tagName === "@link" && inlineTag.tagContent && isFilePath(inlineTag.tagContent)) {
				const range = getInlineTagRange(inlineTag);
				if (range) {
					links.push({
						startIndex: range.start,
						endIndex: range.end,
					});
				}
			}
			// Don't recurse into InlineTag children - getInlineTagRange already walked them
			return;
		}

		// Recurse into child nodes
		const childNodes = currentNode.getChildNodes();
		for (const childNode of childNodes) {
			walk(childNode);
		}
	}

	walk(node);
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
