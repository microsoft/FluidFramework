/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import type { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import type { IJsonCodec } from "../../codec/index.js";
import {
	type MutableTreeStoredSchema,
	type TreeStoredSchema,
	schemaDataIsEmpty,
} from "../../core/index.js";
import {
	VersionedSummarizer,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import type { CollabWindow } from "../incrementalSummarizationUtils.js";

export const schemaStringKey = "SchemaString";

/**
 * The versions for the schema summary format.
 */
export const enum SchemaSummaryFormatVersion {
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

const supportedVersions = new Set<SchemaSummaryFormatVersion>([
	SchemaSummaryFormatVersion.v1,
	SchemaSummaryFormatVersion.v2,
]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToSchemaSummaryFormatVersion(
	version: MinimumVersionForCollab,
): SchemaSummaryFormatVersion {
	// Currently, version 2 is written which adds metadata blob to the summary.
	return SchemaSummaryFormatVersion.v2;
}

/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer
	extends VersionedSummarizer<SchemaSummaryFormatVersion>
	implements Summarizable
{
	private schemaIndexLastChangedSeq: number | undefined;

	public constructor(
		private readonly schema: MutableTreeStoredSchema,
		collabWindow: CollabWindow,
		private readonly codec: IJsonCodec<TreeStoredSchema>,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		super(
			"Schema",
			minVersionToSchemaSummaryFormatVersion(minVersionForCollab),
			supportedVersions,
			true /* supportPreVersioningFormat */,
		);
		this.schema.events.on("afterSchemaChange", () => {
			// Invalidate the cache, as we need to regenerate the blob if the schema changes
			// We are assuming that schema changes from remote ops are valid, as we are in a summarization context.
			this.schemaIndexLastChangedSeq = collabWindow.getCurrentSeq();
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
		const { builder, incrementalSummaryContext, stringify, fullTree = false } = props;
		if (
			!fullTree &&
			incrementalSummaryContext !== undefined &&
			this.schemaIndexLastChangedSeq !== undefined &&
			incrementalSummaryContext.latestSummarySequenceNumber >= this.schemaIndexLastChangedSeq
		) {
			builder.addHandle(
				schemaStringKey,
				SummaryType.Blob,
				`${incrementalSummaryContext.summaryPath}/${schemaStringKey}`,
			);
		} else {
			const dataString = stringify(this.codec.encode(this.schema));
			builder.addBlob(schemaStringKey, dataString);
		}
	}

	protected async loadInternal(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		const schemaBuffer: ArrayBufferLike = await services.readBlob(schemaStringKey);
		// After the awaits, validate that the schema is in a clean state.
		// This detects any schema that could have been accidentally added through
		// invalid means and are about to be overwritten.
		assert(
			schemaDataIsEmpty(this.schema),
			0x3da /* there should not already be stored schema when loading stored schema */,
		);

		const schemaString = bufferToString(schemaBuffer, "utf-8");
		// Currently no Fluid handles are used, so just use JSON.parse.
		const decoded = this.codec.decode(JSON.parse(schemaString));
		this.schema.apply(decoded);
		this.schemaIndexLastChangedSeq = 0;
	}
}
