/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import type { TSchema } from "@sinclair/typebox";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	FluidClientVersion,
} from "../../../codec/index.js";
import {
	CursorLocationType,
	type ITreeCursorSynchronous,
	type SchemaAndPolicy,
	type SchemaPolicy,
	type StoredSchemaCollection,
	type TreeChunk,
} from "../../../core/index.js";
import { brandedNumberType, type Brand } from "../../../util/index.js";
import { TreeCompressionStrategy } from "../../treeCompressionUtils.js";

import { decode } from "./chunkDecoding.js";
import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedFieldBatch,
	FieldBatchFormatVersion,
	EncodedFieldBatchV1,
	EncodedFieldBatchV2,
} from "./format.js";
import type { IncrementalEncodingPolicy } from "./incrementalEncodingPolicy.js";
import { schemaCompressedEncodeV1, schemaCompressedEncodeV2 } from "./schemaBasedEncode.js";
import { uncompressedEncodeV1, uncompressedEncodeV2 } from "./uncompressedEncode.js";

/**
 * Reference ID for a chunk that is incrementally encoded.
 */
export type ChunkReferenceId = Brand<number, "forest.ChunkReferenceId">;
const ChunkReferenceId = brandedNumberType<ChunkReferenceId>({ multipleOf: 1, minimum: 0 });

/**
 * Properties for incremental encoding.
 * Fields that support incremental encoding will encode their chunks separately by calling `encodeIncrementalField`.
 * @remarks
 * This supports features like incremental summarization where the summary from these fields can be re-used if
 * unchanged between summaries.
 * Note that each of these chunks that are incrementally encoded is fully self-describing (contain its own shapes
 * list and identifier table) and does not rely on context from its parent.
 */
export interface IncrementalEncoder {
	/**
	 * Returns whether a node / field should be incrementally encoded.
	 * @remarks See {@link IncrementalEncodingPolicy}.
	 */
	shouldEncodeIncrementally: IncrementalEncodingPolicy;
	/**
	 * Called to encode an incremental field at the cursor.
	 * The chunks for this field are encoded separately from the main buffer.
	 * @param cursor - The cursor pointing to the field to encode.
	 * @param chunkEncoder - A function that encodes the contents of the passed chunk in the field.
	 * @returns The reference IDs of the encoded chunks in the field.
	 * This is used to retrieve the encoded chunks later.
	 */
	encodeIncrementalField(
		cursor: ITreeCursorSynchronous,
		chunkEncoder: (chunk: TreeChunk) => EncodedFieldBatch,
	): ChunkReferenceId[];
}

/**
 * Properties for incremental decoding.
 *
 * Fields that had their chunks incrementally encoded will retrieve them by calling `getEncodedIncrementalChunk`.
 * @remarks
 * See {@link IncrementalEncoder} for more details.
 */
export interface IncrementalDecoder {
	/**
	 * Called to decode an incremental chunk with the given reference ID.
	 * @param referenceId - The reference ID of the chunk to decode.
	 * @param chunkDecoder - A function that decodes the chunk.
	 * @returns The decoded chunk.
	 */
	decodeIncrementalChunk(
		referenceId: ChunkReferenceId,
		chunkDecoder: (encoded: EncodedFieldBatch) => TreeChunk,
	): TreeChunk;
}
/**
 * Combines the properties of {@link IncrementalEncoder} and {@link IncrementalDecoder}.
 */
export interface IncrementalEncoderDecoder extends IncrementalEncoder, IncrementalDecoder {}

export interface FieldBatchEncodingContext {
	readonly encodeType: TreeCompressionStrategy;
	readonly idCompressor: IIdCompressor;
	readonly originatorId: SessionId;
	readonly schema?: SchemaAndPolicy;
	/**
	 * An encoder / decoder for encoding and decoding of incremental fields.
	 * This will be defined if incremental encoding is supported and enabled.
	 */
	readonly incrementalEncoderDecoder?: IncrementalEncoderDecoder;
}
/**
 * @remarks
 * Fields in this batch currently don't have field schema for the root, which limits optimizations.
 */
export type FieldBatchCodec = ReturnType<typeof fieldBatchCodecBuilder.build>;

/**
 * Creates the encode/decode functions for a specific FieldBatch format version.
 */
function makeFieldBatchCodecForVersion(
	writeVersion: FieldBatchFormatVersion,
	uncompressedEncodeFn: (batch: FieldBatch) => EncodedFieldBatch,
	schemaCompressedEncodeFn: (
		schema: StoredSchemaCollection,
		policy: SchemaPolicy,
		fieldBatch: FieldBatch,
		idCompressor: IIdCompressor,
		incrementalEncoder: IncrementalEncoder | undefined,
	) => EncodedFieldBatch,
	encodedFieldBatchType: TSchema,
): CodecAndSchema<FieldBatch, FieldBatchEncodingContext> {
	return {
		encode: (data: FieldBatch, context: FieldBatchEncodingContext): EncodedFieldBatch => {
			for (const cursor of data) {
				assert(
					cursor.mode === CursorLocationType.Fields,
					0x8a3 /* FieldBatch expects fields cursors */,
				);
			}
			let encoded: EncodedFieldBatch;
			let incrementalEncoder: IncrementalEncoder | undefined;
			switch (context.encodeType) {
				case TreeCompressionStrategy.Uncompressed: {
					encoded = uncompressedEncodeFn(data);
					break;
				}
				case TreeCompressionStrategy.CompressedIncremental: {
					assert(
						writeVersion >= FieldBatchFormatVersion.v2,
						0xca0 /* Unsupported FieldBatchFormatVersion for incremental encoding; must be v2 or higher */,
					);
					// Incremental encoding is only supported for CompressedIncremental.
					incrementalEncoder = context.incrementalEncoderDecoder;
				}
				// fallthrough
				case TreeCompressionStrategy.Compressed: {
					// eslint-disable-next-line unicorn/prefer-ternary
					if (context.schema === undefined) {
						// TODO: consider enabling a somewhat compressed but not schema accelerated encode.
						encoded = uncompressedEncodeFn(data);
					} else {
						encoded = schemaCompressedEncodeFn(
							context.schema.schema,
							context.schema.policy,
							data,
							context.idCompressor,
							incrementalEncoder,
						);
					}

					break;
				}
				default: {
					unreachableCase(context.encodeType);
				}
			}

			// TODO: consider checking input data was in schema.
			return encoded;
		},
		decode: (data: EncodedFieldBatch, context: FieldBatchEncodingContext): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(
				data,
				{
					idCompressor: context.idCompressor,
					originatorId: context.originatorId,
				},
				context.incrementalEncoderDecoder,
			).map((chunk) => chunk.cursor());
		},
		schema: encodedFieldBatchType,
	};
}

/**
 * Codec builder for field batch codecs.
 * Uses ClientVersionDispatchingCodecBuilder to dispatch to the appropriate version based on minVersionForCollab.
 */
export const fieldBatchCodecBuilder = ClientVersionDispatchingCodecBuilder.build(
	"FieldBatch",
	[
		{
			minVersionForCollab: lowestMinVersionForCollab,
			formatVersion: FieldBatchFormatVersion.v1,
			codec: makeFieldBatchCodecForVersion(
				FieldBatchFormatVersion.v1,
				uncompressedEncodeV1,
				schemaCompressedEncodeV1,
				EncodedFieldBatchV1,
			),
		},
		{
			minVersionForCollab: FluidClientVersion.v2_73,
			formatVersion: FieldBatchFormatVersion.v2,
			codec: makeFieldBatchCodecForVersion(
				FieldBatchFormatVersion.v2,
				uncompressedEncodeV2,
				schemaCompressedEncodeV2,
				EncodedFieldBatchV2,
			),
		},
	],
);
