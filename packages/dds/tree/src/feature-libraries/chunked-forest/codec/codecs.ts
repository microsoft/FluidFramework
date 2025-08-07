/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionId } from "@fluidframework/id-compressor";

import {
	type FluidClientVersion,
	type ICodecOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../../codec/index.js";
import {
	CursorLocationType,
	type FieldKey,
	type ITreeCursorSynchronous,
	type SchemaAndPolicy,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import {
	brandedNumberType,
	type Brand,
	type JsonCompatibleReadOnly,
} from "../../../util/index.js";
import {
	TreeCompressionStrategy,
	TreeCompressionStrategyExtended,
	type TreeCompressionStrategyInternal,
} from "../../treeCompressionUtils.js";

import { decode } from "./chunkDecoding.js";
import type { FieldBatch } from "./fieldBatch.js";
import { EncodedFieldBatch, validVersions } from "./format.js";
import { schemaCompressedEncode } from "./schemaBasedEncode.js";
import { uncompressedEncode } from "./uncompressedEncode.js";

/**
 * Reference ID for a chunk that is incrementally encoded.
 * @internal
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
	 * Returns whether a field should be incrementally encoded.
	 * @param nodeIdentifier - The identifier of the node containing the field.
	 * @param fieldKey - The key of the field to check.
	 */
	shouldEncodeFieldIncrementally(
		nodeIdentifier: TreeNodeSchemaIdentifier,
		fieldKey: FieldKey,
	): boolean;
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
	 * Called to get the encoded contents of an chunk in an incremental field with the given reference ID.
	 * @param referenceId - The reference ID of the chunk to retrieve.
	 * @returns The encoded contents of the chunk.
	 */
	getEncodedIncrementalChunk: (referenceId: ChunkReferenceId) => EncodedFieldBatch;
}
/**
 * Combines the properties of {@link IncrementalEncoder} and {@link IncrementalDecoder}.
 * @internal
 */
export interface IncrementalEncoderDecoder extends IncrementalEncoder, IncrementalDecoder {}

export interface FieldBatchEncodingContext {
	readonly encodeType: TreeCompressionStrategyInternal;
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
export type FieldBatchCodec = IJsonCodec<
	FieldBatch,
	EncodedFieldBatch,
	JsonCompatibleReadOnly,
	FieldBatchEncodingContext
>;

/**
 * Get the write version for {@link makeFieldBatchCodec} based on the `oldestCompatibleClient` version.
 * @privateRemarks
 * TODO: makeFieldBatchCodec (and makeVersionDispatchingCodec transitively) should bake in this versionToFormat logic and the resulting codec can then support use with FluidClientVersion directly.
 */
export function fluidVersionToFieldBatchCodecWriteVersion(
	oldestCompatibleClient: FluidClientVersion,
): number {
	// There is currently on only 1 version.
	return 1;
}

export function makeFieldBatchCodec(
	options: ICodecOptions,
	writeVersion: number,
): FieldBatchCodec {
	// Note: it's important that the decode function is schema-agnostic for this strategy/layering to work, since
	// the schema that an op was encoded in doesn't necessarily match the current schema for the document (e.g. if
	// decode is being run on a client that just submitted a schema change, but the op is from another client who has
	// yet to receive that change).
	assert(
		validVersions.has(writeVersion),
		0x935 /* Invalid write version for FieldBatch codec */,
	);

	// TODO: use makeVersionDispatchingCodec to support adding more versions in the future.
	return makeVersionedValidatedCodec(options, validVersions, EncodedFieldBatch, {
		encode: (data: FieldBatch, context: FieldBatchEncodingContext): EncodedFieldBatch => {
			for (const cursor of data) {
				assert(
					cursor.mode === CursorLocationType.Fields,
					0x8a3 /* FieldBatch expects fields cursors */,
				);
			}
			let encoded: EncodedFieldBatch;
			switch (context.encodeType) {
				case TreeCompressionStrategy.Uncompressed:
					encoded = uncompressedEncode(data);
					break;
				case TreeCompressionStrategyExtended.CompressedIncremental:
				case TreeCompressionStrategy.Compressed:
					// eslint-disable-next-line unicorn/prefer-ternary
					if (context.schema !== undefined) {
						encoded = schemaCompressedEncode(
							context.schema.schema,
							context.schema.policy,
							data,
							context.idCompressor,
							// Incremental encoding is only supported for CompressedIncremental.
							context.encodeType === TreeCompressionStrategyExtended.CompressedIncremental
								? context.incrementalEncoderDecoder
								: undefined,
						);
					} else {
						// TODO: consider enabling a somewhat compressed but not schema accelerated encode.
						encoded = uncompressedEncode(data);
					}

					break;
				default:
					unreachableCase(context.encodeType);
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
	});
}
