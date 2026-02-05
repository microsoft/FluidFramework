/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "node:assert";
import type { Rule } from "eslint";
import type { DocNode, DocPlainText } from "@microsoft/tsdoc";
import { DocNodeKind, TSDocParser } from "@microsoft/tsdoc";
import { getBlockComments } from "./tsdoc-utils.js";

interface HyphenPatternMatch {
	startIndex: number; // Starting character index of the hyphen pattern (inclusive).
	endIndex: number; // Ending character index of the hyphen pattern (exclusive).
}

const parser = new TSDocParser();

/**
 * Checks if a comment text starts with a hyphen.
 * @param plainTextNode - The plain text node to check.
 * @return The hyphen pattern match info if found; otherwise, undefined.
 */
function doesTextNodeStartWithHyphen(plainTextNode: DocPlainText): HyphenPatternMatch | undefined {
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
 * @param commentBodyNode - The doc node representing the body of the comment.
 * @return The hyphen pattern match info if found; otherwise, undefined.
 */
function doesCommentBodyStartWithHyphen(commentBodyNode: DocNode): HyphenPatternMatch | undefined {
	// Walk down first node of the tree until we find a leaf.
	// If it's plain text, and starts with a hyphen, return true.
	// Otherwise, return false.
	if (commentBodyNode.kind === DocNodeKind.PlainText) {
		return doesTextNodeStartWithHyphen(commentBodyNode as DocPlainText);
	}

	const childNodes = commentBodyNode.getChildNodes();
	if (childNodes.length === 0) {
		return undefined;
	}

	const firstChild = childNodes[0];
	return firstChild ? doesCommentBodyStartWithHyphen(firstChild) : undefined;
}

/**
 * JSDoc/TSDoc tags do not require a hyphen after them.
 */
export const rule: Rule.RuleModule = {
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

	create(context: Rule.RuleContext) {
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

					const blocksToCheck = getBlockComments(parsedComment);

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
