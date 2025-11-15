/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { FluidClientVersion } from "../../codec/index.js";
import { brand, type Brand } from "../../util/index.js";

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
 * The storage key for the blob containing metadata for the forest's summary.
 */
export const forestSummaryMetadataKey = ".metadata";

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
export const ForestSummaryVersion = {
	/**
	 * Version 0 represents summaries before versioning was added. This version is not written.
	 * It is only used to avoid undefined checks.
	 */
	v0: 0,
	/**
	 * Version 1 adds metadata to the forest summary.
	 */
	v1: 1,
	/**
	 * The latest version of the forest summary. Must be updated when a new version is added.
	 */
	vLatest: 1,
} as const;
export type ForestSummaryVersion = Brand<
	(typeof ForestSummaryVersion)[keyof typeof ForestSummaryVersion],
	"ForestSummaryVersion"
>;

/**
 * The type for the metadata in forest's summary.
 * Using type definition instead of interface to make this compatible with JsonCompatible.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ForestSummaryMetadata = {
	/** The version of the forest summary. */
	readonly version: ForestSummaryVersion;
};

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
export function minVersionToForestSummaryVersion(
	version: MinimumVersionForCollab,
): ForestSummaryVersion {
	return version < FluidClientVersion.v2_73
		? brand(ForestSummaryVersion.v0)
		: brand(ForestSummaryVersion.v1);
}
