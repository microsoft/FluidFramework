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
	ISummaryTreeWithStats,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import { FluidClientVersion, type IJsonCodec } from "../../codec/index.js";
import {
	type MutableTreeStoredSchema,
	type SchemaFormatVersion,
	type TreeStoredSchema,
	schemaDataIsEmpty,
} from "../../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import {
	brand,
	readAndParseSnapshotBlob,
	type Brand,
	type JsonCompatible,
} from "../../util/index.js";
import type { CollabWindow } from "../incrementalSummarizationUtils.js";

import { encodeRepo } from "./codec.js";

const schemaStringKey = "SchemaString";

/**
 * The storage key for the blob containing metadata for the schema's summary.
 */
export const schemaMetadataKey = ".metadata";

/**
 * The versions for the schema summary.
 */
export const SchemaSummaryVersion = {
	/**
	 * Version 0 represents summaries before versioning was added. This version is not written.
	 * It is only used to avoid undefined checks.
	 */
	v0: 0,
	/**
	 * Version 1 adds metadata to the schema summary.
	 */
	v1: 1,
} as const;
export type SchemaSummaryVersion = Brand<
	(typeof SchemaSummaryVersion)[keyof typeof SchemaSummaryVersion],
	"SchemaSummaryVersion"
>;

/**
 * The type for the metadata in schema's summary.
 * Using type definition instead of interface to make this compatible with JsonCompatible.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type SchemaSummaryMetadata = {
	/** The version of the schema summary. */
	readonly version: SchemaSummaryVersion;
};

/**
 * Returns the summary version to use as per the given minimum version for collab.
 */
function minVersionToSchemaSummaryVersion(
	version: MinimumVersionForCollab,
): SchemaSummaryVersion {
	return version < FluidClientVersion.v2_73
		? brand(SchemaSummaryVersion.v0)
		: brand(SchemaSummaryVersion.v1);
}

/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer implements Summarizable {
	public readonly key = "Schema";

	private schemaIndexLastChangedSeq: number | undefined;

	/** The summary version to write in the metadata for the schema summary. */
	private readonly summaryWriteVersion: SchemaSummaryVersion;

	public constructor(
		private readonly schema: MutableTreeStoredSchema,
		collabWindow: CollabWindow,
		private readonly codec: IJsonCodec<TreeStoredSchema>,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		this.schema.events.on("afterSchemaChange", () => {
			// Invalidate the cache, as we need to regenerate the blob if the schema changes
			// We are assuming that schema changes from remote ops are valid, as we are in a summarization context.
			this.schemaIndexLastChangedSeq = collabWindow.getCurrentSeq();
		});
		this.summaryWriteVersion = minVersionToSchemaSummaryVersion(minVersionForCollab);
	}

	public summarize(props: {
		stringify: SummaryElementStringifier;
		fullTree?: boolean;
		trackState?: boolean;
		telemetryContext?: ITelemetryContext;
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext;
	}): ISummaryTreeWithStats {
		const incrementalSummaryContext = props.incrementalSummaryContext;
		const builder = new SummaryTreeBuilder();
		const fullTree = props.fullTree ?? false;
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
			const dataString = JSON.stringify(this.codec.encode(this.schema));
			builder.addBlob(schemaStringKey, dataString);
		}

		// Add metadata if the summary version is v1 or higher.
		if (this.summaryWriteVersion >= SchemaSummaryVersion.v1) {
			const metadata: SchemaSummaryMetadata = {
				version: this.summaryWriteVersion,
			};
			builder.addBlob(schemaMetadataKey, JSON.stringify(metadata));
		}
		return builder.getSummaryTree();
	}

	public async load(
		services: IChannelStorageService,
		parse: SummaryElementParser,
	): Promise<void> {
		// Read the metadata blob if present and validate the version.
		if (await services.contains(schemaMetadataKey)) {
			const metadata = await readAndParseSnapshotBlob<SchemaSummaryMetadata>(
				schemaMetadataKey,
				services,
				parse,
			);
			assert(metadata.version === SchemaSummaryVersion.v1, "Unsupported schema summary");
		}

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

/**
 * Dumps schema into a deterministic JSON compatible semi-human readable format.
 *
 * @remarks
 * This can be used to help inspect schema for debugging, and to save a snapshot of schema to help detect and review changes to an applications schema.
 */
export function encodeTreeSchema(
	schema: TreeStoredSchema,
	writeVersion: SchemaFormatVersion,
): JsonCompatible {
	return encodeRepo(schema, writeVersion);
}
