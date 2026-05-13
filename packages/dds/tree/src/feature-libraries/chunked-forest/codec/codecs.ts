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
	EncodedFieldBatchV1,
	EncodedFieldBatchV2,
	FieldBatchFormatVersion,
	supportsIncrementalEncoding,
	type EncodedFieldBatchV1OrV2,
} from "./format/index.js";
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
		chunkEncoder: (chunk: TreeChunk) => EncodedFieldBatchV2,
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
		chunkDecoder: (encoded: EncodedFieldBatchV2) => TreeChunk,
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
	/**
	 * `true` when encoding to or decoding from a summary blob. `false` for
	 * op-stream encode/decode paths and for utility encoders that are not
	 * tied to a persisted document. Healing behavior is gated on this flag.
	 */
	readonly isSummary: boolean;
	/**
	 * If `true`, when an op-space compressed ID encountered while decoding
	 * cannot be resolved by the local id-compressor (e.g. the attach-summary
	 * blob's originator session state was stripped), a deterministic stable
	 * UUID derived from `sharedObjectId` is returned instead of throwing.
	 * @remarks
	 * Off by default. Used only to recover documents whose attach summary was
	 * written with non-finalized op-space IDs before the encode-side fix
	 * shipped. Only takes effect when `isSummary` is also `true`.
	 * See {@link SharedTreeOptionsBeta.healUnresolvableIdentifiersOnDecode}.
	 */
	readonly healUnresolvableIdentifiersOnDecode?: boolean;
	/**
	 * The SharedTree's shared-object id, used as input to the deterministic
	 * UUID derivation when `healUnresolvableIdentifiersOnDecode` triggers. Required
	 * for that path; ignored otherwise.
	 * @remarks
	 * This allows us to ensure that multiple attaches,
	 * in the same or different documents, with the same session offsets, get different UUIDs.
	 */
	readonly sharedObjectId?: string;
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
	version: FieldBatchFormatVersion,
	uncompressedEncodeFn: (batch: FieldBatch) => EncodedFieldBatchV1OrV2,
	schemaCompressedEncodeFn: (
		schema: StoredSchemaCollection,
		policy: SchemaPolicy,
		fieldBatch: FieldBatch,
		idCompressor: IIdCompressor,
		incrementalEncoder: IncrementalEncoder | undefined,
		isSummary: boolean,
	) => EncodedFieldBatchV1OrV2,
	encodedFieldBatchType: TSchema,
): CodecAndSchema<FieldBatch, FieldBatchEncodingContext> {
	return {
		encode: (
			data: FieldBatch,
			context: FieldBatchEncodingContext,
		): EncodedFieldBatchV1OrV2 => {
			for (const cursor of data) {
				assert(
					cursor.mode === CursorLocationType.Fields,
					0x8a3 /* FieldBatch expects fields cursors */,
				);
			}
			let encoded: EncodedFieldBatchV1OrV2;
			let incrementalEncoder: IncrementalEncoder | undefined;
			switch (context.encodeType) {
				case TreeCompressionStrategy.Uncompressed: {
					encoded = uncompressedEncodeFn(data);
					break;
				}
				case TreeCompressionStrategy.CompressedIncremental: {
					assert(
						supportsIncrementalEncoding(version),
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
							context.isSummary,
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
		decode: (
			data: EncodedFieldBatchV1OrV2,
			context: FieldBatchEncodingContext,
		): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(
				data,
				{
					idCompressor: context.idCompressor,
					originatorId: context.originatorId,
					isSummary: context.isSummary,
					healUnresolvableIdentifiersOnDecode: context.healUnresolvableIdentifiersOnDecode,
					sharedObjectId: context.sharedObjectId,
				},
				context.incrementalEncoderDecoder,
			).map((chunk) => chunk.cursor());
		},
		schema: encodedFieldBatchType,
	};
}

/**
 * {@link ClientVersionDispatchingCodecBuilder} for field batch codecs.
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
