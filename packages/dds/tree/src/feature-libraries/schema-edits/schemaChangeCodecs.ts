/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	withSchemaValidation,
} from "../../codec/index.js";
import { makeSchemaCodec } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import type { SchemaChange } from "./schemaChangeTypes.js";
import { SchemaCodecVersion } from "../../core/index.js";

/**
 * Create a family of schema change codecs.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The composed codec family.
 */
export function makeSchemaChangeCodecs(options: ICodecOptions): ICodecFamily<SchemaChange> {
	return makeCodecFamily([
		[SchemaCodecVersion.v1, makeSchemaChangeCodecV1(options, SchemaCodecVersion.v1)],
		[SchemaCodecVersion.v2, makeSchemaChangeCodecV1(options, SchemaCodecVersion.v2)],
	]);
}

/**
 * Create a schema change codec.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @param writeVersion - The schema change write version.
 * @returns The composed codec.
 */
export function makeSchemaChangeCodec(
	options: ICodecOptions,
	writeVersion: SchemaCodecVersion,
): IJsonCodec<SchemaChange> {
	const family = makeSchemaChangeCodecs(options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

/**
 * Compose the v1 schema change codec.
 * @param options - The codec options.
 * @param schemaWriteVersion - The schema write version.
 * @returns The composed schema change codec.
 */
function makeSchemaChangeCodecV1(
	options: ICodecOptions,
	schemaWriteVersion: SchemaCodecVersion,
): IJsonCodec<SchemaChange, EncodedSchemaChange> {
	const schemaCodec = makeSchemaCodec(options, schemaWriteVersion);
	const schemaChangeCodec: IJsonCodec<SchemaChange, EncodedSchemaChange> = {
		encode: (schemaChange) => {
			assert(
				!schemaChange.isInverse,
				0x933 /* Inverse schema changes should never be transmitted */,
			);
			return {
				new: schemaCodec.encode(schemaChange.schema.new),
				old: schemaCodec.encode(schemaChange.schema.old),
			};
		},
		decode: (encoded) => {
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

	return withSchemaValidation(EncodedSchemaChange, schemaChangeCodec, options.jsonValidator);
}
