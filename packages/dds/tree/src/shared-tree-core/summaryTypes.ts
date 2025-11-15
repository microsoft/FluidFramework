/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { brand, type Brand } from "../util/index.js";
import { FluidClientVersion } from "../codec/index.js";

// TODO: Organize this to be adjacent to persisted types.
/**
 * The storage key for the subtree containing all summarizable indexes in the SharedTree summary.
 */
export const summarizablesTreeKey = "indexes";

/**
 * The storage key for the blob containing metadata for the SharedTree's summary.
 */
export const treeSummaryMetadataKey = ".metadata";

/**
 * The versions for the SharedTree summary.
 */
export const SharedTreeSummaryVersion = {
	/**
	 * Version 0 represents summaries before versioning was added. This version is not written.
	 * It is only used to avoid undefined checks.
	 */
	v0: 0,
	/**
	 * Version 1 adds metadata to the SharedTree summary.
	 */
	v1: 1,
	/**
	 * The latest version of the SharedTree summary. Must be updated when a new version is added.
	 */
	vLatest: 1,
} as const;
export type SharedTreeSummaryVersion = Brand<
	(typeof SharedTreeSummaryVersion)[keyof typeof SharedTreeSummaryVersion],
	"SharedTreeSummaryVersion"
>;

/**
 * The type for the metadata in SharedTree's summary.
 * Using type definition instead of interface to make this compatible with JsonCompatible.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SharedTreeSummaryMetadata = {
	/** The version of the SharedTree summary. */
	readonly version: SharedTreeSummaryVersion;
};

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
export function minVersionToSharedTreeSummaryVersion(
	version: MinimumVersionForCollab,
): SharedTreeSummaryVersion {
	return version < FluidClientVersion.v2_73
		? brand(SharedTreeSummaryVersion.v0)
		: brand(SharedTreeSummaryVersion.v1);
}
