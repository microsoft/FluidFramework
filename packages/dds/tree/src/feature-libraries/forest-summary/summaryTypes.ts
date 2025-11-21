/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

/**
 * The key for the tree that contains the overall forest's summary tree.
 * This tree is added by the parent of the forest summarizer.
 * See {@link ForestIncrementalSummaryBuilder} for details on the summary structure.
 */
export const forestSummaryKey = "Forest";

/**
 * The key for the blob under ForestSummarizer's root.
 * This blob contains the ForestCodec's output.
 * See {@link ForestIncrementalSummaryBuilder} for details on the summary structure.
 */
export const forestSummaryContentKey = "ForestTree";

/**
 * The contents of an incremental chunk is under a summary tree node with its {@link ChunkReferenceId} as the key.
 * The inline portion of the chunk content is encoded with the forest codec is stored in a blob with this key.
 * The rest of the chunk contents  is stored in the summary tree under the summary tree node.
 * See the summary format in {@link ForestIncrementalSummaryBuilder} for more details.
 */
export const chunkContentsBlobKey = "contents";

/**
 * The versions for the forest summary.
 */
export enum ForestSummaryFormatVersion {
	/**
	 * This version represents summary format before summary versioning was introduced.
	 */
	v1 = 1,
	/**
	 * This version adds metadata to the summary. This is backward compatible with version 1.
	 */
	v2 = 2,
	/**
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v2,
}

export const supportedForestSummaryFormatVersions = new Set<ForestSummaryFormatVersion>([
	ForestSummaryFormatVersion.v1,
	ForestSummaryFormatVersion.v2,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
export function minVersionToForestSummaryFormatVersion(
	version: MinimumVersionForCollab,
): ForestSummaryFormatVersion {
	// Currently, version 2 is written which adds metadata blob to the summary.
	return ForestSummaryFormatVersion.v2;
}
