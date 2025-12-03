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
export abstract class VersionedSummarizer implements Summarizable {
	public constructor(
		/** {@link Summarizable.key} */
		public readonly key: string,
		/** The format version of the summary to write in the summary metadata. */
		private readonly writeVersion: number,
		/** The set of supported versions that a summary can have for this summarizer to load it. */
		private readonly supportedVersions: ReadonlySet<number>,
		/**
		 * The default format version to use if the summary during load doesn't have metadata blob.
		 * This is used for summaries that were written before versioning was added for summaries.
		 * @remarks
		 * This version may not be supported if the support for the version before metadata blob was dropped.
		 * In that case, this will not be present in `supportedVersions` and an error will be thrown during load.
		 */
		private readonly defaultReadVersion: number,
	) {
		assert(
			this.supportedVersions.has(this.writeVersion),
			`Write version ${this.writeVersion} must be supported.`,
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
		// This is the version before metadata blob with version is written into the summary.
		let version = this.defaultReadVersion;
		if (await services.contains(summarizablesMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<SharedTreeSummarizableMetadata>(
				summarizablesMetadataKey,
				services,
				(contents) => parse(contents),
			);
			version = metadata.version;
		}
		if (!this.supportedVersions.has(version)) {
			throw new UsageError(`Cannot read version ${version} of shared tree summary.`);
		}
		await this.loadInternal(services, parse);
	}
}
