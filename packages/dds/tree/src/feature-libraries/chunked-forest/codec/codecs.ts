/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	CursorLocationType,
	ITreeCursorSynchronous,
	StoredSchemaCollection,
} from "../../../core/index.js";
import { JsonCompatibleReadOnly } from "../../../util/index.js";
import {
	ICodecOptions,
	IJsonCodec,
	IJsonCodecWithContext,
	makeVersionedValidatedCodec,
} from "../../../codec/index.js";
import { FullSchemaPolicy } from "../../modular-schema/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeCompressionStrategy } from "../../treeCompressionUtils.js";
import { EncodedFieldBatch, validVersions } from "./format.js";
import { decode } from "./chunkDecoding.js";
import { schemaCompressedEncode } from "./schemaBasedEncoding.js";
import { FieldBatch } from "./fieldBatch.js";
import { uncompressedEncode } from "./uncompressedEncode.js";

/**
 * Helper for processing multiple fields one at a time.
 */
export class FieldBatchEncoder {
	private readonly fields: ITreeCursorSynchronous[] = [];
	public add(field: ITreeCursorSynchronous): number {
		assert(
			field.mode === CursorLocationType.Fields,
			"Cursor for batch must be in fields mode.",
		);
		this.fields.push(field);
		return this.fields.length - 1;
	}
	public encode(codec: IJsonCodec<FieldBatch, EncodedFieldBatch>): EncodedFieldBatch {
		return codec.encode(this.fields);
	}
}

export interface Context {
	readonly encodeType: TreeCompressionStrategy;
	readonly schema?: SchemaAndPolicy;
}

export type FieldBatchCodec = IJsonCodecWithContext<
	FieldBatch,
	EncodedFieldBatch,
	JsonCompatibleReadOnly,
	Context
>;

export function makeFieldBatchCodec(
	options: ICodecOptions,
): IJsonCodecWithContext<FieldBatch, EncodedFieldBatch, JsonCompatibleReadOnly, Context> {
	// TODO: every time context changes, withSchemaValidation and makeVersionedCodec recompile their json validators.
	// Those should be reused. Making more code context aware could fix that.
	return (context: Context) =>
		makeVersionedValidatedCodec(options, validVersions, EncodedFieldBatch, {
			encode: (data: FieldBatch): EncodedFieldBatch => {
				for (const cursor of data) {
					assert(
						cursor.mode === CursorLocationType.Fields,
						"FieldBatch expects fields cursors",
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

interface SchemaAndPolicy {
	readonly schema: StoredSchemaCollection;
	readonly policy: FullSchemaPolicy;
}
