/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";
import { FluidClientVersion } from "../../codec/index.js";

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
export enum ForestSummaryVersion {
	/**
	 * Version 1. This version adds metadata to the SharedTree summary.
	 */
	v1 = 1,
	/**
	 * The latest version of the forest summary. Must be updated when a new version is added.
	 */
	vLatest = v1,
}

export const supportedForestSummaryReadVersions = new Set<ForestSummaryVersion>([
	ForestSummaryVersion.v1,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 * Undefined is returned if the given version is lower than the one where summary versioning was introduced.
 */
export function minVersionToForestSummaryVersion(
	version: MinimumVersionForCollab,
): ForestSummaryVersion | undefined {
	return getConfigForMinVersionForCollab(version, {
		[lowestMinVersionForCollab]: undefined,
		[FluidClientVersion.v2_73]: ForestSummaryVersion.v1,
	});
}
