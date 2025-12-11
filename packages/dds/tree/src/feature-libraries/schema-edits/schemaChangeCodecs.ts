/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	type ICodecFamily,
	type IJsonCodec,
	makeCodecFamily,
	makeVersionDispatchingCodec,
	withSchemaValidation,
} from "../../codec/index.js";
import { getCodecTreeForSchemaFormat, makeSchemaCodec } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import type { SchemaChange } from "./schemaChangeTypes.js";
import { SchemaFormatVersion } from "../../core/index.js";

/**
 * Create a family of schema change codecs.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The composed codec family.
 */
export function makeSchemaChangeCodecs(
	options: CodecWriteOptions,
): ICodecFamily<SchemaChange> {
	return makeCodecFamily([
		[SchemaFormatVersion.v1, makeSchemaChangeCodecV1(options, SchemaFormatVersion.v1)],
		[SchemaFormatVersion.v2, makeSchemaChangeCodecV1(options, SchemaFormatVersion.v2)],
	]);
}

export function getCodecTreeForSchemaChangeFormat(
	version: SchemaFormatVersion,
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return {
		name: "SchemaChange",
		version,
		children: [getCodecTreeForSchemaFormat(clientVersion)],
	};
}

/**
 * Create a schema change codec.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @param writeVersion - The schema change write version.
 * @returns The composed codec.
 */
export function makeSchemaChangeCodec(
	options: CodecWriteOptions,
	writeVersion: SchemaFormatVersion,
): IJsonCodec<SchemaChange> {
	const family = makeSchemaChangeCodecs(options);
	return makeVersionDispatchingCodec(family, { ...options, writeVersion });
}

/**
 * Compose the change codec using mostly v1 logic.
 * @param options - The codec options.
 * @param schemaWriteVersion - The schema write version.
 * @returns The composed schema change codec.
 */
function makeSchemaChangeCodecV1(
	options: CodecWriteOptions,
	schemaWriteVersion: SchemaFormatVersion,
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
