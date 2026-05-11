/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { CodecWriteOptions, JsonCodecPart } from "../../codec/index.js";
import { schemaCodecBuilder } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import type { SchemaChange } from "./schemaChangeTypes.js";

/**
 * Creates a codec for schema changes.
 * @param options - The codec options.
 * @returns The composed schema change codec part.
 */
export function makeSchemaChangeCodec(
	options: CodecWriteOptions,
): JsonCodecPart<SchemaChange, typeof EncodedSchemaChange> {
	const schemaCodec = schemaCodecBuilder.build(options);
	return {
		encode: (schemaChange: SchemaChange): EncodedSchemaChange => {
			assert(
				!schemaChange.isInverse,
				0x933 /* Inverse schema changes should never be transmitted */,
			);
			return {
				new: schemaCodec.encode(schemaChange.schema.new),
				old: schemaCodec.encode(schemaChange.schema.old),
			};
		},
		decode: (encoded: EncodedSchemaChange): SchemaChange => {
			return {
				schema: {
					new: schemaCodec.decode(encoded.new),
					old: schemaCodec.decode(encoded.old),
				},
				isInverse: false,
			};
		},
		encodedSchema: EncodedSchemaChange,
	};
}
