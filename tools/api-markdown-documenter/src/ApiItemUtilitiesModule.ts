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
} from "./api-item-transforms";
export {
	getDefaultValueBlock,
	getDeprecatedBlock,
	getExampleBlocks,
	getModifiers,
	getQualifiedApiItemName,
	getReleaseTag,
	getReturnsBlock,
	getSeeBlocks,
	getThrowsBlocks,
	getUnscopedPackageName,
	isDeprecated,
	isOptional,
	isReadonly,
	isStatic,
} from "./utilities";
