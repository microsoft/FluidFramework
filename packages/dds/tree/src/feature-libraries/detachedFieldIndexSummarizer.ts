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

import type { DetachedFieldIndex } from "../core/index.js";
import {
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
	VersionedSummarizer,
} from "../shared-tree-core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";
import { FluidClientVersion } from "../codec/index.js";

/**
 * The storage key for the blob in the summary containing schema data
 */
const detachedFieldIndexBlobKey = "DetachedFieldIndexBlob";

/**
 * The storage key for the blob containing metadata for the detached field index's summary.
 */
export const detachedFieldIndexMetadataKey = ".metadata";

/**
 * The versions for the detached field index summary.
 */
export const enum DetachedFieldIndexSummaryVersion {
	/**
	 * Version 1. This version adds metadata to the SharedTree summary.
	 */
	v1 = 1,
	/**
	 * The latest version of the detached field index summary. Must be updated when a new version is added.
	 */
	vLatest = v1,
}

const supportedReadVersions = new Set<DetachedFieldIndexSummaryVersion>([
	DetachedFieldIndexSummaryVersion.v1,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 * Undefined is returned if the given version is lower than the one where summary versioning was introduced.
 */
function minVersionToDetachedFieldIndexSummaryVersion(
	version: MinimumVersionForCollab,
): DetachedFieldIndexSummaryVersion | undefined {
	return getConfigForMinVersionForCollab(version, {
		[lowestMinVersionForCollab]: undefined,
		[FluidClientVersion.v2_73]: DetachedFieldIndexSummaryVersion.v1,
	});
}

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class DetachedFieldIndexSummarizer extends VersionedSummarizer implements Summarizable {
	public constructor(
		private readonly detachedFieldIndex: DetachedFieldIndex,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		super({
			key: "DetachedFieldIndex",
			writeVersion: minVersionToDetachedFieldIndexSummaryVersion(minVersionForCollab),
			supportedReadVersions,
		});
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
