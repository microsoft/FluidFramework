/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "./summaryTypes.js";
import { readAndParseSnapshotBlob } from "../util/index.js";

/**
 * Utility for implementing {@link Summarizable}s classes with versioning.
 * It handles versioning of summaries - writing version metadata to summaries
 * and checking version compatibility when loading.
 */
export abstract class VersionedSummarizer<TVersion extends number> implements Summarizable {
	public constructor(
		/** {@link Summarizable.key} */
		public readonly key: string,
		/** The format version of the summary to write in the summary metadata. */
		private readonly writeVersion: TVersion,
		/** The set of supported versions that a summary can have for this summarizer to load it. */
		private readonly supportedVersions: ReadonlySet<TVersion>,
		/**
		 * Whether to support loading summaries before versioning was added, i.e., summaries without metadata blob.
		 * @remarks
		 * This version may not be supported if the support for the version before metadata blob was dropped.
		 * In that case, this will not be present in `supportedVersions` and an error will be thrown during load.
		 */
		private readonly supportPreVersioningFormat: boolean,
	) {
		assert(
			this.supportedVersions.has(this.writeVersion),
			"Unsupported write version requested.",
			() => `Write version ${this.writeVersion} requested but not supported with key ${key}.`,
		);
	}

	/**
	 * The summarize function that derived classes must implement. They should use the passed summary tree builder to
	 * add their summary data.
	 */
	protected abstract summarizeInternal(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
		builder: SummaryTreeBuilder;
	}): void;

	/**
	 * The load function that derived classes must implement to load their summary data.
	 */
	protected abstract loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
		/**
		 * The format version of the summary being loaded, or undefined if this is pre-versioning format,
		 * i.e., the summary has no version metadata.
		 */
		version: TVersion | undefined,
	): Promise<void>;

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		const metadata: SharedTreeSummarizableMetadata = {
			version: this.writeVersion,
		};
		builder.addBlob(summarizablesMetadataKey, props.stringify(metadata));
		this.summarizeInternal({ ...props, builder });
		return builder.getSummaryTree();
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		let version: TVersion | undefined;
		if (await services.contains(summarizablesMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<SharedTreeSummarizableMetadata>(
				summarizablesMetadataKey,
				services,
				(contents) => parse(contents),
			);
			version = metadata.version as TVersion;
			if (!this.supportedVersions.has(version)) {
				throw new UsageError(`Cannot read version ${version} of shared tree summary.`);
			}
		} else if (!this.supportPreVersioningFormat) {
			throw new UsageError(`Cannot read summary without versioning for shared tree summary.`);
		}
		await this.loadInternal(services, parse, version);
	}
}
