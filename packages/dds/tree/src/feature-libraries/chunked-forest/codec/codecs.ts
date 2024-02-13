/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { CursorLocationType, StoredSchemaCollection } from "../../../core/index.js";
import { JsonCompatibleReadOnly } from "../../../util/index.js";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../../codec/index.js";
import { FullSchemaPolicy } from "../../modular-schema/index.js";
import { TreeCompressionStrategy } from "../../treeCompressionUtils.js";
import { EncodedFieldBatch, validVersions } from "./format.js";
import { decode } from "./chunkDecoding.js";
import { schemaCompressedEncode } from "./schemaBasedEncoding.js";
import { FieldBatch } from "./fieldBatch.js";
import { uncompressedEncode } from "./uncompressedEncode.js";

export interface FieldBatchEncodingContext {
	readonly encodeType: TreeCompressionStrategy;
	readonly schema?: SchemaAndPolicy;
}

export interface SchemaAndPolicy {
	readonly schema: StoredSchemaCollection;
	readonly policy: FullSchemaPolicy;
}

export type FieldBatchCodec = IJsonCodec<
	FieldBatch,
	EncodedFieldBatch,
	JsonCompatibleReadOnly,
	FieldBatchEncodingContext
>;

export function makeFieldBatchCodec(options: ICodecOptions): FieldBatchCodec {
	// Note: it's important that the decode function is schema-agnostic for this strategy/layering to work, since
	// the schema that an op was encoded in doesn't necessarily match the current schema for the document (e.g. if
	// decode is being run on a client that just submitted a schema change, but the op is from another client who has
	// yet to receive that change).

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
		decode: (data: EncodedFieldBatch): FieldBatch => {
			// TODO: consider checking data is in schema.
			return decode(data).map((chunk) => chunk.cursor());
		},
	});
}
