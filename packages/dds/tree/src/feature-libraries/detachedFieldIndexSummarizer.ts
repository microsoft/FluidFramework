/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import type { DetachedFieldIndex } from "../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../shared-tree-core/index.js";
import {
	brand,
	readAndParseSnapshotBlob,
	type Brand,
	type JsonCompatibleReadOnly,
} from "../util/index.js";
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
export const DetachedFieldIndexSummaryVersion = {
	/**
	 * Version 0 represents summaries before versioning was added. This version is not written.
	 * It is only used to avoid undefined checks.
	 */
	v0: 0,
	/**
	 * Version 1 adds metadata to the detached field index summary.
	 */
	v1: 1,
} as const;
export type DetachedFieldIndexSummaryVersion = Brand<
	(typeof DetachedFieldIndexSummaryVersion)[keyof typeof DetachedFieldIndexSummaryVersion],
	"DetachedFieldIndexSummaryVersion"
>;

/**
 * The type for the metadata in the detached field index's summary.
 * Using type definition instead of interface to make this compatible with JsonCompatible.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type DetachedFieldIndexSummaryMetadata = {
	/** The version of the detached field index summary. */
	readonly version: DetachedFieldIndexSummaryVersion;
};

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToDetachedFieldIndexSummaryVersion(
	version: MinimumVersionForCollab,
): DetachedFieldIndexSummaryVersion {
	return version < FluidClientVersion.v2_73
		? brand(DetachedFieldIndexSummaryVersion.v0)
		: brand(DetachedFieldIndexSummaryVersion.v1);
}

/**
 * Provides methods for summarizing and loading a tree index.
 */
export class DetachedFieldIndexSummarizer implements Summarizable {
	public readonly key = "DetachedFieldIndex";

	// The summary version to write in the metadata for the detached field index summary.
	private readonly summaryWriteVersion: DetachedFieldIndexSummaryVersion;

	public constructor(
		private readonly detachedFieldIndex: DetachedFieldIndex,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		this.summaryWriteVersion =
			minVersionToDetachedFieldIndexSummaryVersion(minVersionForCollab);
	}

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		const data = this.detachedFieldIndex.encode();
		const builder = new SummaryTreeBuilder();
		builder.addBlob(detachedFieldIndexBlobKey, props.stringify(data));

		if (this.summaryWriteVersion >= DetachedFieldIndexSummaryVersion.v1) {
			const metadata: DetachedFieldIndexSummaryMetadata = {
				version: this.summaryWriteVersion,
			};
			builder.addBlob(detachedFieldIndexMetadataKey, JSON.stringify(metadata));
		}

		return builder.getSummaryTree();
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(detachedFieldIndexMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<DetachedFieldIndexSummaryMetadata>(
				detachedFieldIndexMetadataKey,
				services,
				parse,
			);
			assert(
				metadata.version >= DetachedFieldIndexSummaryVersion.v1,
				"Unsupported detached field index summary",
			);
		}

		if (await services.contains(detachedFieldIndexBlobKey)) {
			const detachedFieldIndexBuffer = await services.readBlob(detachedFieldIndexBlobKey);
			const treeBufferString = bufferToString(detachedFieldIndexBuffer, "utf8");
			const parsed = parse(treeBufferString) as JsonCompatibleReadOnly;
			this.detachedFieldIndex.loadData(parsed);
		}
	}
}
