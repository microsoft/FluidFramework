/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	public readonly key: string;
	private readonly writeVersion: number;
	private readonly supportedVersions: Set<number>;
	private readonly defaultVersion: number;

	public constructor(props: {
		/** {@link Summarizable.key} */
		key: string;
		/** The format version of the summary to write in the summary metadata. */
		writeVersion: number;
		/** The set of supported versions that a summary can have for this summarizer to load it. */
		supportedVersions: Set<number>;
		/**
		 * The default format version to use if the summary doesn't have metadata blob.
		 * This is true for summaries that were written before versioning was added for summaries.
		 */
		defaultVersion: number;
	}) {
		this.key = props.key;
		this.writeVersion = props.writeVersion;
		this.supportedVersions = props.supportedVersions;
		this.defaultVersion = props.defaultVersion;
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
		let version = this.defaultVersion;
		if (await services.contains(summarizablesMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<SharedTreeSummarizableMetadata>(
				summarizablesMetadataKey,
				services,
				(contents) => parse(contents),
			);
			version = metadata.version;
		}
		if (!this.supportedVersions.has(version)) {
			throw new UsageError(
				`Cannot read version ${version} of shared tree summary. Upgrade to a supported version.`,
			);
		}
		await this.loadInternal(services, parse);
	}
}
