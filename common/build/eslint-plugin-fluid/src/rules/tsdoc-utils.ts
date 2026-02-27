/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for working with TSDoc parsed comments.
 */

import type { DocBlock, DocComment } from "@microsoft/tsdoc";

/**
 * Options for getting block comments from a parsed TSDoc comment.
 */
export interface GetBlockCommentsOptions {
	exclude?: string[];
}

/**
 * Checks if a tag name should be excluded based on the exclude list.
 * @param tagName - The tag name to check (e.g., "@privateRemarks").
 * @param excludeSet - Set of normalized tag names to exclude.
 * @returns True if the tag should be excluded.
 */
function shouldExcludeTag(tagName: string, excludeSet: Set<string>): boolean {
	// Normalize to uppercase for case-insensitive comparison (TSDoc convention)
	return excludeSet.has(tagName.toUpperCase());
}

/**
 * Gets all block nodes from a parsed TSDoc comment that should be checked.
 * @param parsedComment - The parsed TSDoc comment.
 * @param options - Options for filtering blocks. Use `exclude` to specify tag names to exclude (e.g., ['@privateRemarks']).
 * @returns Array of block nodes to check.
 */
export function getBlockComments(
	parsedComment: DocComment,
	options: GetBlockCommentsOptions = {},
): DocBlock[] {
	const { exclude = [] } = options;
	// Normalize exclude list to uppercase for case-insensitive comparison (TSDoc convention)
	const excludeSet = new Set(exclude.map((tag) => tag.toUpperCase()));

	const blocksToCheck: DocBlock[] = [];

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
