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
 */
export function makeSchemaChangeCodecs(
	options: CodecWriteOptions,
): ICodecFamily<SchemaChange> {
	const schemaChangeCodecV1OrV2 = makeSchemaChangeCodecV1orV2(options);
	return makeCodecFamily([
		[SchemaChangeFormatVersion.v1, schemaChangeCodecV1OrV2],
		[SchemaChangeFormatVersion.v2, schemaChangeCodecV1OrV2],
	]);
}

/**
 * The format version for the schema change.
 * @remarks
 * The SchemaChangeFormat is not explicitly versioned in the data.
 * Therefore it may make more sense to inline this codec's formats into the parent codec that references it, rather than treating this like a versioned codec.
 */
export const SchemaChangeFormatVersion = strictEnum("SchemaChangeFormatVersion", {
	v1: 1,
	/**
	 * Same as V1: Added unnecessarily when {@link SchemaFormatVersion.v2} was added.
	 */
	v2: 2,
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
 * Compose the change codec using mostly v1 logic.
 * @param options - The codec options.
 * @param schemaWriteVersion - The schema write version.
 * @returns The composed schema change codec.
 */
function makeSchemaChangeCodecV1orV2(
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
