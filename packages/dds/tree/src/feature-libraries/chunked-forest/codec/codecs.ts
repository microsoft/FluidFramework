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
import { CursorLocationType, type SchemaAndPolicy } from "../../../core/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";
import { TreeCompressionStrategy } from "../../treeCompressionUtils.js";

import { decode } from "./chunkDecoding.js";
import type { FieldBatch } from "./fieldBatch.js";
import { EncodedFieldBatch, validVersions, type EncodedFieldBatchFormat } from "./format.js";
import { schemaCompressedEncode } from "./schemaBasedEncode.js";
import { uncompressedEncode } from "./uncompressedEncode.js";

export interface IncrementalEncodingParameters {
	/**
	 * The data for fields that support incremental encoding during encoding should be stored here.
	 */
	readonly outputIncrementalFieldsBatch: Map<string, EncodedFieldBatchFormat>;
	/**
	 * A flag indicating whether all fields should be encoded irrespective of whether they have changed or not.
	 * If true, all fields will be encoded in the batch, even if they have not changed since the last encoding.
	 * Defaults to false.
	 */
	readonly fullTree: boolean;
}

export interface IncrementalDecodingParameters {
	/**
	 * The data for fields that support incremental encoding should be retrieved from here during decoding.
	 */
	readonly getIncrementalFieldBatch: (fieldKey: string) => EncodedFieldBatch;
}

export interface FieldBatchEncodingContext {
	readonly encodeType: TreeCompressionStrategy;
	readonly idCompressor: IIdCompressor;
	readonly originatorId: SessionId;
	readonly schema?: SchemaAndPolicy;
	/**
	 * The parameters for incremental encoding. Must be provided if doing incremental encoding.
	 */
	readonly incrementalEncodingParams?: IncrementalEncodingParameters;
	/**
	 * The parameters for incremental decoding. Must be provided if the data was encoded with incremental encoding.
	 */
	readonly incrementalDecodingParams?: IncrementalDecodingParameters;
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
				case TreeCompressionStrategy.Compressed:
					// eslint-disable-next-line unicorn/prefer-ternary
					if (context.schema !== undefined) {
						encoded = schemaCompressedEncode(
							context.schema.schema,
							context.schema.policy,
							data,
							context.idCompressor,
							context.incrementalEncodingParams,
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
				context.incrementalDecodingParams?.getIncrementalFieldBatch,
			).map((chunk) => chunk.cursor());
		},
	});
}
