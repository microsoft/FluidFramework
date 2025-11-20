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
	treeSummaryMetadataKey,
	type SharedTreeSummarizableMetadata,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "./summaryTypes.js";
import { readAndParseSnapshotBlob } from "../util/index.js";

/**
 * Base class from which all {@link Summarizable}s derive.
 * It handles versioning of summaries - writing version metadata to summaries
 * and checking version compatibility when loading.
 */
export abstract class VersionedSummarizer implements Summarizable {
	public readonly key: string;
	private readonly writeVersion: number | undefined;
	private readonly supportedReadVersions: Set<number>;

	public constructor(props: {
		/** {@link Summarizable.key} */
		key: string;
		/** The version number to write in the summary metadata. If undefined, no version metadata is written. */
		writeVersion: number | undefined;
		/** The set of supported versions that a summary can have for this summarizer to load it. */
		supportedReadVersions: Set<number>;
	}) {
		this.key = props.key;
		this.writeVersion = props.writeVersion;
		this.supportedReadVersions = props.supportedReadVersions;
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
		if (this.writeVersion !== undefined) {
			const metadata: SharedTreeSummarizableMetadata = {
				version: this.writeVersion,
			};
			builder.addBlob(treeSummaryMetadataKey, props.stringify(metadata));
		}
		this.summarizeInternal({ ...props, builder });
		return builder.getSummaryTree();
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		if (await services.contains(treeSummaryMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<SharedTreeSummarizableMetadata>(
				treeSummaryMetadataKey,
				services,
				(contents) => parse(contents),
			);
			if (!this.supportedReadVersions.has(metadata.version)) {
				throw new UsageError(
					`Cannot read version ${metadata.version} of shared tree summary. Upgrade to a supported version.`,
				);
			}
		}
		await this.loadInternal(services, parse);
	}
}
