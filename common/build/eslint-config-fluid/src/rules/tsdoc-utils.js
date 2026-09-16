/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

//@ts-check
/**
 * Utilities for working with TSDoc parsed comments.
 *
 * @typedef {import('@microsoft/tsdoc').DocBlock} DocBlock
 * @typedef {import('@microsoft/tsdoc').DocComment} DocComment
 * @typedef {import('@microsoft/tsdoc').DocNode} DocNode
 */

/**
 * Options for getting block comments from a parsed TSDoc comment.
 * @typedef {{
 * 	exclude?: string[];
 * }} GetBlockCommentsOptions
 */

/**
 * Checks if a tag name should be excluded based on the exclude list.
 * @param {string} tagName - The tag name to check (e.g., "@privateRemarks").
 * @param {Set<string>} excludeSet - Set of normalized tag names to exclude.
 * @returns {boolean} True if the tag should be excluded.
 */
function shouldExcludeTag(tagName, excludeSet) {
	// Normalize to uppercase for case-insensitive comparison (TSDoc convention)
	return excludeSet.has(tagName.toUpperCase());
}

/**
 * Gets all block nodes from a parsed TSDoc comment that should be checked.
 * @param {DocComment} parsedComment - The parsed TSDoc comment.
 * @param {GetBlockCommentsOptions} [options] - Options for filtering blocks. Use `exclude` to specify tag names to exclude (e.g., ['@privateRemarks']).
 * @returns {DocBlock[]} Array of block nodes to check.
 */
function getBlockComments(parsedComment, options = {}) {
	const { exclude = [] } = options;
	// Normalize exclude list to uppercase for case-insensitive comparison (TSDoc convention)
	const excludeSet = new Set(exclude.map((tag) => tag.toUpperCase()));

	const blocksToCheck = [];

	// Filter customBlocks and seeBlocks based on their tag names
	for (const block of parsedComment.customBlocks) {
		if (!shouldExcludeTag(block.blockTag.tagName, excludeSet)) {
			blocksToCheck.push(block);
		}
	}

	for (const block of parsedComment.seeBlocks) {
		if (!shouldExcludeTag(block.blockTag.tagName, excludeSet)) {
			blocksToCheck.push(block);
		}
	}

	// Check standard blocks
	if (parsedComment.remarksBlock && !shouldExcludeTag("@remarks", excludeSet)) {
		blocksToCheck.push(parsedComment.remarksBlock);
	}
	if (parsedComment.privateRemarks && !shouldExcludeTag("@privateRemarks", excludeSet)) {
		blocksToCheck.push(parsedComment.privateRemarks);
	}
	if (parsedComment.deprecatedBlock && !shouldExcludeTag("@deprecated", excludeSet)) {
		blocksToCheck.push(parsedComment.deprecatedBlock);
	}
	if (parsedComment.returnsBlock && !shouldExcludeTag("@returns", excludeSet)) {
		blocksToCheck.push(parsedComment.returnsBlock);
	}

	return blocksToCheck;
}

module.exports = {
	getBlockComments,
};
