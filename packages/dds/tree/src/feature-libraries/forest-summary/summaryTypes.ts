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
 * The entire contents of the ForestSummarizer's summary (ForestCodec's output) is added to a blob with this key.
 * This was added in {@link ForestSummaryFormatVersion.v1 | version 1} and is used in
 * {@link ForestSummaryFormatVersion.v1 | version 1} and {@link ForestSummaryFormatVersion.v2 | version 2}.
 */
export const summaryContentBlobKeyV1 = "ForestTree";

/**
 * From {@link ForestSummaryFormatVersion.v3 | version 3} onwards, the inline portion of the top-level forest content
 * is stored in a summary blob with this key.
 * If the summary is not incremental, the content stored is the entire forest content.
 * If the summary is incremental, the contents of the incremental chunks is stored separately:
 * The contents of an incremental chunk is under a summary tree node with its {@link ChunkReferenceId} as the key.
 * The inline portion of the chunk content is encoded with the forest codec and is stored in a blob with this key as
 * well. The rest of the chunk contents  is stored in the summary tree under the summary tree node.
 *
 * @remarks
 * See the summary format in {@link ForestIncrementalSummaryBuilder} for more details.
 */
export const summaryContentBlobKeyV3 = "contents";

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
	 * This version adds support for summaries with incremental chunks. Also, the ForestSummarizer's root contents are
	 * stored in {@link summaryContentBlobKeyV3} instead of {@link summaryContentBlobKeyV1}.
	 * This is not backward compatible with versions 1 and 2.
	 */
	v3 = 3,
	/**
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v3,
}

export const supportedForestSummaryFormatVersions = new Set<ForestSummaryFormatVersion>([
	ForestSummaryFormatVersion.v1,
	ForestSummaryFormatVersion.v2,
	ForestSummaryFormatVersion.v3,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
export function minVersionToForestSummaryFormatVersion(
	version: MinimumVersionForCollab,
): ForestSummaryFormatVersion {
	return getConfigForMinVersionForCollab(version, {
		[lowestMinVersionForCollab]: ForestSummaryFormatVersion.v2,
		[FluidClientVersion.v2_74]: ForestSummaryFormatVersion.v3,
	});
}

/**
 * Gets the key for the blob containing the forest summary root content based on the summary format version.
 * @param summaryFormatVersion - The version of the forest summary format.
 * @returns The key for the forest summary root content blob.
 */
export function getForestRootSummaryContentKey(
	summaryFormatVersion: ForestSummaryFormatVersion | undefined,
): string {
	// In versions prior to v3, the forest summary root content is stored under `summaryContentBlobKeyV1`.
	// From version v3 onwards, it is stored under `summaryContentBlobKeyV3`.
	return summaryFormatVersion === undefined ||
		summaryFormatVersion < ForestSummaryFormatVersion.v3
		? summaryContentBlobKeyV1
		: summaryContentBlobKeyV3;
}
