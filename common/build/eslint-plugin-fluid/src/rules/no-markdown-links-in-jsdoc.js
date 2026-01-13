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
 * Finds instances of Markdown-syntax links within the provided plain text.
 * @param {DocPlainText} plainTextNode - The plain text node to check.
 * @returns {MarkdownLinkInfo[]} The list of found Markdown links.
 */
function findMarkdownLinksInPlainText(plainTextNode) {
	const textRange =
		plainTextNode.textExcerpt?.getContainingTextRange() ??
		fail("Expected textExcerpt to be defined.");
	// RegEx explanation:
	// \[        - Match the opening square bracket
	// ([^\]]*)  - Capture group 1: Match zero or more characters that are not a closing square bracket (the link text)
	// \]        - Match the closing square bracket
	// \(        - Match the opening parenthesis
	// ([^)]*)   - Capture group 2: Match zero or more characters that are not a closing parenthesis (the link target)
	// \)        - Match the closing parenthesis
	const matches = plainTextNode.text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g);
	return Array.from(matches, (match) => ({
		linkText: match[1],
		linkTarget: match[2],
		startIndex: textRange.pos + match.index,
		endIndex: textRange.pos + match.index + match[0].length,
	}));
}

/**
 * Finds instances of Markdown-syntax links within the provided comment body.
 * @param { DocNode } commentBodyNode - The doc node representing the body of the comment.
 * @returns {MarkdownLinkInfo[]} The list of found Markdown links.
 */
function findMarkdownLinks(commentBodyNode) {
	// Walk down all children to find all plain text nodes.
	// Search those nodes for Markdown links.
	// We only search plain text because we want to ignore link syntax that may appear in other
	// contexts like code spans / code blocks where they would not be interpreted as links, and
	// where they may exist to serve as examples, etc.
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
 * Eslint rule to disallow Markdown link syntax in JSDoc/TSDoc comments.
 * `{@link}` syntax should be used instead.
 *
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
					 * Checks the provided comment block for Markdown-syntax links and report eslint errors for them.
					 * @param {DocNode} node - The comment block to check.
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
									const tsdocLink = trimmedText.length > 0
										? `{@link ${link.linkTarget} | ${trimmedText}}`
										: `{@link ${link.linkTarget}}`;
									return fixer.replaceTextRange(
										[startIndex, endIndex],
										tsdocLink,
									);
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
