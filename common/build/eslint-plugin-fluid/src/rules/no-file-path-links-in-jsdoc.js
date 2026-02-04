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

const { DocNodeKind, TSDocParser } = require("@microsoft/tsdoc");

const parser = new TSDocParser();

/**
 * Extracts the text excerpt from a DocNode and searches for file path links.
 * @param {DocNode} node - The doc node to extract text from.
 * @returns {FilePathLinkMatch[]} The list of found file path links.
 */
function findFilePathLinks(node) {
	const links = [];

	// Recursively walk the node tree
	function walk(currentNode) {
		// Check if this node has an excerpt that we can extract text from
		if (currentNode.excerpt) {
			const textRange = currentNode.excerpt.getContainingTextRange();
			const text = currentNode.excerpt.content.toString();

			// JSDoc/TSDoc link syntax: {@link target|text} or {@link target}
			// Find links where the `target` component is a file path (starts with `/`, `./`, or `../`)
			const matches = text.matchAll(/{@link\s+(\/|\.\/|\.\.\/).*?}/g);
			for (const match of matches) {
				links.push({
					startIndex: textRange.pos + match.index,
					endIndex: textRange.pos + match.index + match[0].length,
				});
			}
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
					const parserContext = parser.parseString(`/**${comment.value}*/`);
					const parsedComment = parserContext.docComment;

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

					/**
					 * Checks the provided comment block for file path links and report eslint errors for them.
					 * @param {DocNode} node - The comment block to check.
					 * @returns {void}
					 */
					function checkCommentBlock(node) {
						const links = findFilePathLinks(node);
						for (const link of links) {
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

					// Check summary section and all blocks (except privateRemarks)
					checkCommentBlock(parsedComment.summarySection);
					for (const block of blocksToCheck) {
						checkCommentBlock(block.content);
					}
				}
			},
		};
	},
};
