/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { CodecWriteOptions, JsonCodecPart } from "../../codec/index.js";
import {
	CompareAndSwapSchemaChangeset,
	type SchemaChangeset,
} from "../schema-change-family/index.js";
import { schemaCodecBuilder } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";

/**
 * Creates a codec for schema changes.
 * @param options - The codec options.
 * @returns The composed schema change codec part.
 */
export function makeSchemaChangeCodec(
	options: CodecWriteOptions,
): JsonCodecPart<SchemaChangeset, typeof EncodedSchemaChange> {
	const schemaCodec = schemaCodecBuilder.build(options);
	return {
		encode: (schemaChange: SchemaChangeset): EncodedSchemaChange => {
			// Other types of schema changes will be supported in the future
			assert(
				schemaChange instanceof CompareAndSwapSchemaChangeset,
				"Only compare-and-swap schema changes may be encoded",
			);
			assert(
				!schemaChange.isInverse,
				0x933 /* Inverse schema changes should never be transmitted */,
			);
			assert(
				!schemaChange.hasConflicts(),
				"Conflicted schema changes should never be transmitted",
			);
			return {
				new: schemaCodec.encode(schemaChange.output),
				old: schemaCodec.encode(schemaChange.input),
			};
		},
		decode: (encoded: EncodedSchemaChange): SchemaChangeset => {
			return new CompareAndSwapSchemaChangeset(
				schemaCodec.decode(encoded.old),
				schemaCodec.decode(encoded.new),
			);
		},
		encodedSchema: EncodedSchemaChange,
	};
}
