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
import type { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import type { DetachedFieldIndex } from "../core/index.js";
import {
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
	VersionedSummarizer,
} from "../shared-tree-core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

/**
 * The storage key for the blob in the summary containing schema data
 */
export const detachedFieldIndexBlobKey = "DetachedFieldIndexBlob";

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
	 * The latest version of the summary. Must be updated when a new version is added.
	 */
	vLatest = v2,
}

const supportedVersions = new Set<DetachedFieldIndexSummaryFormatVersion>([
	DetachedFieldIndexSummaryFormatVersion.v1,
	DetachedFieldIndexSummaryFormatVersion.v2,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToDetachedFieldIndexSummaryFormatVersion(
	version: MinimumVersionForCollab,
): DetachedFieldIndexSummaryFormatVersion {
	// Currently, version 2 is written which adds metadata blob to the summary.
	return DetachedFieldIndexSummaryFormatVersion.v2;
}

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class DetachedFieldIndexSummarizer
	extends VersionedSummarizer<DetachedFieldIndexSummaryFormatVersion>
	implements Summarizable
{
	public constructor(
		private readonly detachedFieldIndex: DetachedFieldIndex,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		super(
			"DetachedFieldIndex",
			minVersionToDetachedFieldIndexSummaryFormatVersion(minVersionForCollab),
			supportedVersions,
			true,
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
		builder.addBlob(detachedFieldIndexBlobKey, stringify(data));
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(detachedFieldIndexBlobKey)) {
			const detachedFieldIndexBuffer = await services.readBlob(detachedFieldIndexBlobKey);
			const treeBufferString = bufferToString(detachedFieldIndexBuffer, "utf8");
			const parsed = parse(treeBufferString) as JsonCompatibleReadOnly;
			this.detachedFieldIndex.loadData(parsed);
		}
	}
}
