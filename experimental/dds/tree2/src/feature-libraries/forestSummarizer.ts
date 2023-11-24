/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary } from "@fluidframework/shared-object-base";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	applyDelta,
	Delta,
	FieldKey,
	IEditableForest,
	ITreeCursorSynchronous,
	makeDetachedFieldIndex,
	mapCursorField,
	mapCursorFields,
	StoredSchemaCollection,
} from "../core";
import { Summarizable, SummaryElementParser, SummaryElementStringifier } from "../shared-tree-core";
import { idAllocatorFromMaxId } from "../util";
import { ICodecOptions, IJsonCodec, noopValidator } from "../codec";
import { EncodedChunk, decode, schemaCompressedEncode, uncompressedEncode } from "./chunked-forest";
import { FullSchemaPolicy } from "./modular-schema";
import { TreeCompressionStrategy } from "./treeCompressionUtils";
import { Format } from "./forestSummarizerFormat";
import { makeForestSummarizerCodec } from "./forestSummarizerCodec";

/**
 * The storage key for the blob in the summary containing tree data
 */
const treeBlobKey = "ForestTree";

/**
 * Provides methods for summarizing and loading a forest.
 */
export class ForestSummarizer implements Summarizable {
	public readonly key = "Forest";

	private readonly schema: StoredSchemaCollection;
	private readonly policy: FullSchemaPolicy;
	private readonly encodeType: TreeCompressionStrategy;
	private readonly codec: IJsonCodec<[FieldKey, EncodedChunk][], Format>;
	private readonly options: ICodecOptions;

	public constructor(
		private readonly forest: IEditableForest,
		schema: StoredSchemaCollection,
		policy: FullSchemaPolicy,
		encodeType: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
		options?: ICodecOptions,
	) {
		this.schema = schema;
		this.policy = policy;
		this.encodeType = encodeType;
		this.options = options ?? { jsonValidator: noopValidator };
		this.codec = makeForestSummarizerCodec(this.options);
	}

	/**
	 * Synchronous monolithic summarization of tree content.
	 *
	 * TODO: when perf matters, this should be replaced with a chunked async version using a binary format.
	 *
	 * @returns a snapshot of the forest's tree as a string.
	 */
	private getTreeString(stringify: SummaryElementStringifier): string {
		const rootCursor = this.forest.getCursorAboveDetachedFields();
		// TODO: Encode all detached fields in one operation for better performance and compression
		const fields: [FieldKey, EncodedChunk][] = mapCursorFields(rootCursor, (cursor) => [
			rootCursor.getFieldKey(),
			encodeSummary(cursor, this.schema, this.policy, this.encodeType),
		]);
		return stringify(this.codec.encode(fields));
	}

	public getAttachSummary(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return createSingleBlobSummary(treeBlobKey, this.getTreeString(stringify));
	}

	public async summarize(
		stringify: SummaryElementStringifier,
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return createSingleBlobSummary(treeBlobKey, this.getTreeString(stringify));
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
		if (await services.contains(treeBlobKey)) {
			const treeBuffer = await services.readBlob(treeBlobKey);
			const treeBufferString = bufferToString(treeBuffer, "utf8");
			// TODO: this code is parsing data without an optional validator, this should be defined in a typebox schema as part of the
			// forest summary format.
			const fields = this.codec.decode(parse(treeBufferString) as Format);
			const allocator = idAllocatorFromMaxId();
			const fieldChanges: [FieldKey, Delta.FieldChanges][] = fields.map(
				([fieldKey, content]) => {
					const nodeCursors = mapCursorField(decode(content).cursor(), (cursor) =>
						cursor.fork(),
					);
					const buildId = { minor: allocator.allocate(nodeCursors.length) };

					return [
						fieldKey,
						{
							build: [
								{
									id: buildId,
									trees: nodeCursors,
								},
							],
							local: [{ count: nodeCursors.length, attach: buildId }],
						},
					];
				},
			);

			assert(this.forest.isEmpty, 0x797 /* forest must be empty */);
			applyDelta(
				{ fields: new Map(fieldChanges) },
				this.forest,
				makeDetachedFieldIndex("init"),
			);
		}
	}
}

function encodeSummary(
	cursor: ITreeCursorSynchronous,
	schema: StoredSchemaCollection,
	policy: FullSchemaPolicy,
	encodeType: TreeCompressionStrategy,
): EncodedChunk {
	switch (encodeType) {
		case TreeCompressionStrategy.Compressed:
			return schemaCompressedEncode(schema, policy, cursor);
		case TreeCompressionStrategy.Uncompressed:
			return uncompressedEncode(cursor);
		default:
			unreachableCase(encodeType);
	}
}
