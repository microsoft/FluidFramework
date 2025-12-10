/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The key for the tree that contains the overall forest's summary tree.
 * This tree is added by the parent of the forest summarizer.
 * See {@link ForestIncrementalSummaryBuilder} for details on the summary structure.
 */
export const forestSummaryKey = "Forest";

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
