/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import type { TSchema } from "@sinclair/typebox";

import {
	VersionDispatchingCodecBuilder,
	type CodecAndSchema,
	type VersionDispatchingCodec,
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
import {
	brandedNumberType,
	IdDecodingContext,
	type Brand,
	type IdDecoderOptionsOriginatorless,
	type IdDecoderOptionsWithOriginator,
} from "../../../util/index.js";
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

/**
 * Encode-side context for {@link FieldBatchCodec}.
 *
 * Carries only the data the encoder actually consumes. Originator-session
 * lookup, heal flags, and the incremental *decoder* live on
 * {@link FieldBatchDecodingContext}.
 */
export interface FieldBatchEncodingContext {
	readonly encodeType: TreeCompressionStrategy;
	readonly idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
	/**
	 * Encoder for incremental fields. Defined when incremental encoding is
	 * supported and enabled.
	 */
	readonly incrementalEncoder?: IncrementalEncoder;
	/**
	 * `true` when encoding to a summary blob. `false` for op-stream encode
	 * paths and for utility encoders that aren't tied to a persisted document.
	 *
	 * @remarks
	 * Used by the node encoder to decide whether non-finalized op-space ids
	 * can be written into the batch (they can't, for summaries).
	 */
	readonly isSummary: boolean;
}

/**
 * Decode-side context for {@link FieldBatchCodec}.
 *
 * Carries the per-call `resolveEncodedId` function that encapsulates the
 * originator-session lookup and (for the forest-summarizer's legacy heal path)
 * the deterministic UUIDv5 synthesis. Heal and originator-session flags live
 * inside that function, not on this context.
 *
 * Constructed via one of the two named static factories — {@link forOp} or
 * {@link forSummary} — depending on the call site's semantics. The constructor
 * is private; there is no general-purpose builder, because the choice between
 * op-style and summary-style decoding is load-bearing (different invariants
 * apply, and bugs in this area are typically the result of conflating them).
 */
export class FieldBatchDecodingContext extends IdDecodingContext {
	private constructor(
		private readonly options: IdDecoderOptionsOriginatorless | IdDecoderOptionsWithOriginator,
		/**
		 * Decoder for incremental fields. Defined when the encoded batch contains
		 * incremental chunks. Only populated on summary-style contexts; op-style
		 * contexts always have this undefined.
		 */
		public readonly incrementalDecoder?: IncrementalDecoder,
	) {
		super(options);
	}

	/**
	 * Construct a decode context for an op.
	 *
	 * The originator is the session that produced the encoded form (carried
	 * alongside the op envelope by the caller). Heal-on-decode is *not*
	 * available — an unresolvable id during op decode indicates a real bug,
	 * not a recoverable state, so the resolver throws rather than synthesizing
	 * a UUID. Incremental decoding is not used for ops.
	 */
	public static forOp(options: IdDecoderOptionsWithOriginator): FieldBatchDecodingContext {
		return new FieldBatchDecodingContext(options);
	}

	/**
	 * Construct a decode context for a summary blob.
	 *
	 * Summaries must contain only ids resolvable without an originator — either
	 * finalized op-space ids, or (when {@link IdentifierHealingConfig} is supplied
	 * via `healing`) non-final ids that get healed into deterministic UUIDv5
	 * strings. Incremental decoding is attached via {@link withIncrementalDecoder}.
	 *
	 * @privateRemarks
	 * In the future (if adding a summary format which includes the session id),
	 * this could allow providing an originator ID to allow for op-space compressed identifiers in attach summaries.
	 * Non-attach summaries should only have finalized compressed identifiers (due to only being made by summary clients which never allocate identifiers since they never edit).
	 * Since only non-attach summaries can be incremental, incremental summaries should never have non finalized identifiers.
	 * `withIncrementalDecoder` has logic to guard against cases which expect session-relative identifiers in incremental chunks,
	 * as does the encoding-side assert in the {@link EncoderContext}.
	 */
	public static forSummary(
		options: IdDecoderOptionsOriginatorless | IdDecoderOptionsWithOriginator,
	): FieldBatchDecodingContext {
		return new FieldBatchDecodingContext(options);
	}

	/**
	 * Returns a copy of this context with `incrementalDecoder` swapped in. Used by
	 * the forest summarizer to attach the per-call incremental builder to a base
	 * decode context.
	 */
	public withIncrementalDecoder(
		incrementalDecoder: IncrementalDecoder,
	): FieldBatchDecodingContext {
		// As different incremental chunks may come from different sessions,
		// for now we simply enforce that we do not provide an originator session ID
		// when we might be dealing with incremental chunks.
		// This mitigates the risk of using incorrect originator session ID identifiers in incremental chunks.
		// See also private remarks on forSummary.
		assert(
			!this.hasOriginatorSessionId,
			0xd0c /* withIncrementalDecoder can only be called on contexts without an originator session ID */,
		);
		return new FieldBatchDecodingContext(this.options, incrementalDecoder);
	}
}

/**
 * @remarks
 * Fields in this batch currently don't have field schema for the root, which limits optimizations.
 */
export type FieldBatchCodec = VersionDispatchingCodec<
	FieldBatch,
	FieldBatchEncodingContext,
	FieldBatchFormatVersion,
	FieldBatchDecodingContext
>;

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
): CodecAndSchema<FieldBatch, FieldBatchEncodingContext, FieldBatchDecodingContext> {
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
					incrementalEncoder = context.incrementalEncoder;
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
			context: FieldBatchDecodingContext,
		): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(data, context, context.incrementalDecoder).map((chunk) => chunk.cursor());
		},
		schema: encodedFieldBatchType,
	};
}

/**
 * {@link VersionDispatchingCodecBuilder} for field batch codecs.
 */
export const fieldBatchCodecBuilder = VersionDispatchingCodecBuilder.build("FieldBatch", [
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
]);
