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

import { FluidClientVersion, type IJsonCodec } from "../../codec/index.js";
import {
	type MutableTreeStoredSchema,
	type SchemaFormatVersion,
	type TreeStoredSchema,
	schemaDataIsEmpty,
} from "../../core/index.js";
import {
	VersionedSummarizer,
	type Summarizable,
	type SummaryElementParser,
	type SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import type { JsonCompatible } from "../../util/index.js";
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
export const enum SchemaSummaryVersion {
	/**
	 * Version 1. This version adds metadata to the SharedTree summary.
	 */
	v1 = 1,
	/**
	 * The latest version of the schema summary. Must be updated when a new version is added.
	 */
	vLatest = v1,
}

const supportedReadVersions = new Set<SchemaSummaryVersion>([SchemaSummaryVersion.v1]);

/**
 * Returns the summary version to use as per the given minimum version for collab.
 * Undefined is returned if the given version is lower than the one where summary versioning was introduced.
 */
function minVersionToSchemaSummaryVersion(
	version: MinimumVersionForCollab,
): SchemaSummaryVersion | undefined {
	return version < FluidClientVersion.v2_73 ? undefined : SchemaSummaryVersion.v1;
}

/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer extends VersionedSummarizer implements Summarizable {
	private schemaIndexLastChangedSeq: number | undefined;

	public constructor(
		private readonly schema: MutableTreeStoredSchema,
		collabWindow: CollabWindow,
		private readonly codec: IJsonCodec<TreeStoredSchema>,
		minVersionForCollab: MinimumVersionForCollab,
	) {
		super({
			key: "Schema",
			writeVersion: minVersionToSchemaSummaryVersion(minVersionForCollab),
			supportedReadVersions,
		});
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
