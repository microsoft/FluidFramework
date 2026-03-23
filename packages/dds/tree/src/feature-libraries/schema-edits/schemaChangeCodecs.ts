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
	withSchemaValidation,
} from "../../codec/index.js";
import { strictEnum, type Values } from "../../util/index.js";
import { schemaCodecBuilder } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import type { SchemaChange } from "./schemaChangeTypes.js";

/**
 * Create a family of schema change codecs.
 * @param options - Specifies common codec options, including which `validator` to use.
 * @returns The composed codec family.
 * @remarks
 * Data encoded with this codec is not versioned.
 * Users of this codec must therefore ensure that the decoder always knows which version was used.
 */
export function makeSchemaChangeCodecs(
	options: CodecWriteOptions,
): ICodecFamily<SchemaChange> {
	// TODO:
	// Inlining the schema change codec V1 into its parent codec,
	// removing the use of codec family here.
	return makeCodecFamily([[SchemaChangeFormatVersion.v1, makeSchemaChangeCodecV1(options)]]);
}

/**
 * The format version for the schema change.
 * @remarks
 * The SchemaChangeFormat is not explicitly versioned in the data.
 *
 * TODO: Inline this codec's formats into the parent codec that references it, rather than treating this like a versioned codec. See related notes in makeSchemaChangeCodecs.
 */
export const SchemaChangeFormatVersion = strictEnum("SchemaChangeFormatVersion", {
	v1: 1,
});
export type SchemaChangeFormatVersion = Values<typeof SchemaChangeFormatVersion>;

export function getCodecTreeForSchemaChangeFormat(
	version: SchemaChangeFormatVersion,
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return {
		name: "SchemaChange",
		version,
		children: [schemaCodecBuilder.getCodecTree(clientVersion)],
	};
}

/**
 * This is independently versioned from the schemaCodec version.
 * @param options - The codec options.
 * @param schemaWriteVersion - The schema write version.
 * @returns The composed schema change codec.
 */
function makeSchemaChangeCodecV1(
	options: CodecWriteOptions,
): IJsonCodec<SchemaChange, EncodedSchemaChange> {
	const schemaCodec = schemaCodecBuilder.build(options);
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
