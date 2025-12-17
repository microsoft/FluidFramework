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
import { ForestSummaryFormatVersion } from "./summaryFormatCommon.js";
import { summaryContentBlobKey as summaryContentBlobKeyV1ToV2 } from "./summaryFormatV1ToV2.js";
import { summaryContentBlobKey as summaryContentBlobKeyV3 } from "./summaryFormatV3.js";

/**
 * Returns the summary format version to use as per the given minimum version for collab.
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
	return summaryFormatVersion === undefined ||
		summaryFormatVersion < ForestSummaryFormatVersion.v3
		? summaryContentBlobKeyV1ToV2
		: summaryContentBlobKeyV3;
}
