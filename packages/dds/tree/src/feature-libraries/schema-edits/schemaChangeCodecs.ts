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
import { SchemaFormatVersion } from "../../core/index.js";
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
	// This codec has no need to force specific versions of the inner schema codec.
	// The inner schema codec is explicitly versioned, and could safely select its own version based on the provided options.
	// This change however would modify which version of it got selected in some cases, altering snapshot tests and being somewhat high risk.
	// Therefore such a change should be made in a PR with no other changes for easier review, ensuring it is the only cause of the snapshot changes.
	// Doing this only requires removing the overrides below and updating the snapshots.
	// TODO:
	// Once the above is done, another change can be made to simplify this:
	// SchemaChangeFormatVersion.v1 and SchemaChangeFormatVersion.v2 are the same, and since the version is never encoded, can be deduplicated.
	// TODO:
	// Further cleanup should be done here by inlining the schema change codec V1 into its parent codec,
	// removing the use of codec family here.

	return makeCodecFamily([
		[
			SchemaChangeFormatVersion.v1,
			makeSchemaChangeCodecV1orV2({
				...options,
				allowPossiblyIncompatibleWriteVersionOverrides: true,
				writeVersionOverrides: new Map([
					...(options.writeVersionOverrides ?? []),
					[schemaCodecBuilder.name, SchemaFormatVersion.v1],
				]),
			}),
		],
		[
			SchemaChangeFormatVersion.v2,
			makeSchemaChangeCodecV1orV2({
				...options,
				allowPossiblyIncompatibleWriteVersionOverrides: true,
				writeVersionOverrides: new Map([
					...(options.writeVersionOverrides ?? []),
					[schemaCodecBuilder.name, SchemaFormatVersion.v2],
				]),
			}),
		],
	]);
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
 * This is the same for both v1 and v2 and wrap an independently versioned schemaCodec which may be of any version.
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
