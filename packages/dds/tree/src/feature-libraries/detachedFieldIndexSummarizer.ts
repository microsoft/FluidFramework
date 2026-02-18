/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
	type SummaryTreeBuilder,
} from "@fluidframework/runtime-utils/internal";

import { FluidClientVersion } from "../codec/index.js";
import type { DetachedFieldIndex } from "../core/index.js";
import {
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
	VersionedSummarizer,
} from "../shared-tree-core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

import { summaryContentBlobKey as summaryContentBlobKeyV1ToV2 } from "./detachedFieldIndexSummaryFormatV1ToV2.js";
import { summaryContentBlobKey as summaryContentBlobKeyV3 } from "./detachedFieldIndexSummaryFormatV3.js";

/**
 * The versions for the detached field index summary format.
 */
export const enum DetachedFieldIndexSummaryFormatVersion {
	/**
	 * This version represents summary format before summary versioning was introduced.
	 */
	v1 = 1,
	/**
	 * This version adds metadata to the summary. This is backward compatible with version 1.
	 */
	v2 = 2,
	/**
	 * This version changes the key where the summary content is stored.
	 * This is not backward compatible with version 1 or 2.
	 */
	v3 = 3,
	/**
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v3,
}

const supportedVersions = new Set<DetachedFieldIndexSummaryFormatVersion>([
	DetachedFieldIndexSummaryFormatVersion.v1,
	DetachedFieldIndexSummaryFormatVersion.v2,
	DetachedFieldIndexSummaryFormatVersion.v3,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToDetachedFieldIndexSummaryFormatVersion(
	version: MinimumVersionForCollab,
): DetachedFieldIndexSummaryFormatVersion {
	return getConfigForMinVersionForCollab(version, {
		[lowestMinVersionForCollab]: DetachedFieldIndexSummaryFormatVersion.v2,
		[FluidClientVersion.v2_90]: DetachedFieldIndexSummaryFormatVersion.v3,
	});
}

/**
 * Gets the key for the blob containing the detached field index summary content based on the summary format version.
 * @param summaryFormatVersion - The version of the detached field index summary format.
 * @returns The key for the detached field index summary content blob.
 */
function getDetachedFieldIndexSummaryContentKey(
	summaryFormatVersion: DetachedFieldIndexSummaryFormatVersion | undefined,
): string {
	return summaryFormatVersion === undefined ||
		summaryFormatVersion < DetachedFieldIndexSummaryFormatVersion.v3
		? summaryContentBlobKeyV1ToV2
		: summaryContentBlobKeyV3;
}

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class DetachedFieldIndexSummarizer
	extends VersionedSummarizer<DetachedFieldIndexSummaryFormatVersion>
	implements Summarizable
{
	private readonly writeSummaryContentBlobKey: string;

	public constructor(
		private readonly detachedFieldIndex: DetachedFieldIndex,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		const summaryFormatWriteVersion =
			minVersionToDetachedFieldIndexSummaryFormatVersion(minVersionForCollab);
		super("DetachedFieldIndex", summaryFormatWriteVersion, supportedVersions, true);
		this.writeSummaryContentBlobKey = getDetachedFieldIndexSummaryContentKey(
			summaryFormatWriteVersion,
		);
	}

	protected summarizeInternal(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
		builder: SummaryTreeBuilder;
	}): void {
		const { stringify, builder } = props;
		const data = this.detachedFieldIndex.encode();
		builder.addBlob(this.writeSummaryContentBlobKey, stringify(data));
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
		version: DetachedFieldIndexSummaryFormatVersion | undefined,
	): Promise<void> {
		const summaryContentBlobKey = getDetachedFieldIndexSummaryContentKey(version);
		if (await services.contains(summaryContentBlobKey)) {
			const detachedFieldIndexBuffer = await services.readBlob(summaryContentBlobKey);
			const treeBufferString = bufferToString(detachedFieldIndexBuffer, "utf8");
			const parsed = parse(treeBufferString) as JsonCompatibleReadOnly;
			this.detachedFieldIndex.loadData(parsed);
		}
	}
}
