/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module bundles `ApiItem`-related utilities as a single library export.
 */

export {
	doesItemRequireOwnDocument,
	filterItems,
	getHeadingForApiItem,
	getLinkForApiItem,
	shouldItemBeIncluded,
} from "./api-item-transforms/index.js";
export {
	ancestryHasModifierTag,
	getCustomBlockComments,
	getDefaultValueBlock,
	getDeprecatedBlock,
	getExampleBlocks,
	getFileSafeNameForApiItem,
	getModifiers,
	getModifierTags,
	getReleaseTag,
	getReturnsBlock,
	getSeeBlocks,
	getSingleLineExcerptText,
	getThrowsBlocks,
	getUnscopedPackageName,
	hasModifierTag,
	isDeprecated,
	isOptional,
	isReadonly,
	isStatic,
} from "./utilities/index.js";
