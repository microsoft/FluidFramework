/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { ICodecOptions, IJsonCodec } from "../codec";
import { TreeStoredSchema, MutableTreeStoredSchema, schemaDataIsEmpty } from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { JsonCompatible } from "../util";
import { makeSchemaCodec, Format, encodeRepo } from "./schemaIndexFormat";

/**
 * The storage key for the blob in the summary containing schema data
 */
const schemaBlobKey = "SchemaBlob";

const schemaStringKey = "SchemaString";

/**
 * Provides methods for summarizing and loading a schema repository.
 */
export class SchemaSummarizer implements Summarizable {
	public readonly key = "Schema";

	private schemaBlobCache: IFluidHandle<ArrayBufferLike> | undefined;
	private readonly codec: IJsonCodec<TreeStoredSchema, Format>;

	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly schema: MutableTreeStoredSchema,
		options: ICodecOptions,
	) {
		this.codec = makeSchemaCodec(options);
		this.schema.on("afterSchemaChange", () => {
			// Invalidate the cache, as we need to regenerate the blob if the schema changes
			this.schemaBlobCache = undefined;
		});
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		// Currently no Fluid handles are used, so just use JSON.stringify.
		const dataString = JSON.stringify(this.codec.encode(this.schema));
		return createSingleBlobSummary(schemaStringKey, dataString);
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		if (this.schemaBlobCache === undefined) {
			// Currently no Fluid handles are used, so just use JSON.stringify.
			const schemaText = JSON.stringify(this.codec.encode(this.schema));

			// For now we are not chunking the the schema, but still put it in a reusable blob:
			this.schemaBlobCache = await this.runtime.uploadBlob(IsoBuffer.from(schemaText));
		}
		return createSingleBlobSummary(schemaBlobKey, stringify(this.schemaBlobCache));
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
		const [hasString, hasBlob] = await Promise.all([
			services.contains(schemaStringKey),
			services.contains(schemaBlobKey),
		]);
		assert(hasString || hasBlob, 0x3d8 /* Schema is required in summary */);
		let schemaBuffer: ArrayBufferLike;
		if (hasBlob) {
			const handleBuffer = await services.readBlob(schemaBlobKey);
			const handleString = bufferToString(handleBuffer, "utf-8");
			const handle = parse(handleString) as IFluidHandle<ArrayBufferLike>;
			schemaBuffer = await handle.get();
		} else {
			schemaBuffer = await services.readBlob(schemaStringKey);
		}

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
	}
}

/**
 * Dumps schema into a deterministic JSON compatible semi-human readable but unspecified format.
 *
 * @remarks
 * This can be used to help inspect schema for debugging, and to save a snapshot of schema to help detect and review changes to an applications schema.
 *
 * This format may change across major versions of this package: such changes are considered breaking.
 * Beyond that, no compatibility guarantee is provided for this format: it should never be relied upon to load data, it should only be used for comparing outputs from this function.
 * @privateRemarks
 * This currently uses the schema summary format, but that could be changed to something more human readable (particularly if the encoded format becomes less human readable).
 * This intentionally does not leak the format types in the API.
 * @alpha
 */
export function encodeTreeSchema(schema: TreeStoredSchema): JsonCompatible {
	return encodeRepo(schema);
}
