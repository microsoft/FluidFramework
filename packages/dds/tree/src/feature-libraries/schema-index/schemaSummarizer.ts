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
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";

import type { ICodecOptions, IJsonCodec } from "../../codec/index.js";
import {
	type MutableTreeStoredSchema,
	type TreeStoredSchema,
	schemaDataIsEmpty,
} from "../../core/index.js";
import type {
	Summarizable,
	SummaryElementParser,
	SummaryElementStringifier,
} from "../../shared-tree-core/index.js";
import type { CollabWindow } from "../incrementalSummarizationUtils.js";

import { encodeRepo, makeSchemaCodec } from "./codec.js";
import type { Format } from "./format.js";

const schemaStringKey = "SchemaString";
/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer implements Summarizable {
	public readonly key = "Schema";

	private readonly codec: IJsonCodec<TreeStoredSchema, Format>;

	private schemaIndexLastChangedSeq: number | undefined;

	public constructor(
		private readonly schema: MutableTreeStoredSchema,
		options: ICodecOptions,
		collabWindow: CollabWindow,
	) {
		this.codec = makeSchemaCodec(options);
		this.schema.events.on("afterSchemaChange", () => {
			// Invalidate the cache, as we need to regenerate the blob if the schema changes
			// We are assuming that schema changes from remote ops are valid, as we are in a summarization context.
			this.schemaIndexLastChangedSeq = collabWindow.getCurrentSeq();
		});
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		if (
			incrementalSummaryContext !== undefined &&
			this.schemaIndexLastChangedSeq !== undefined &&
			incrementalSummaryContext.latestSummarySequenceNumber >= this.schemaIndexLastChangedSeq
		) {
			builder.addHandle(
				schemaStringKey,
				SummaryType.Blob,
				`${incrementalSummaryContext.summaryPath}/indexes/${this.key}/${schemaStringKey}`,
			);
		} else {
			const dataString = JSON.stringify(this.codec.encode(this.schema));
			builder.addBlob(schemaStringKey, dataString);
		}
		return builder.getSummaryTree();
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		throw new Error("Method not implemented.");
	}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		// TODO: Properly implement garbage collection. Right now, garbage collection is performed automatically
		// by the code in SharedObject (from which SharedTreeCore extends). The `runtime.uploadBlob` API delegates
		// to the `BlobManager`, which automatically populates the summary with ISummaryAttachment entries for each
		// blob.
		return {
			gcNodes: {},
		};
	}

	public async load(
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
export function encodeTreeSchema(schema: TreeStoredSchema): Format {
	return encodeRepo(schema);
}
