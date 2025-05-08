/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	makeCodecFamily,
	withSchemaValidation,
} from "../../codec/index.js";
import { makeSchemaCodecs, type Format as FormatV1 } from "../schema-index/index.js";

import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import type { SchemaChange } from "./schemaChangeTypes.js";

export function makeSchemaChangeCodecs(options: ICodecOptions): ICodecFamily<SchemaChange> {
	return makeCodecFamily([[1, makeSchemaChangeCodec(options, 1)]]);
}

function makeSchemaChangeCodec(
	{ jsonValidator: validator }: ICodecOptions,
	formatVersion: number,
): IJsonCodec<SchemaChange, EncodedSchemaChange> {
	const schemaCodecs = makeSchemaCodecs({ jsonValidator: validator });
	const schemaCodec =
		schemaCodecs.resolve(formatVersion) ?? fail("Unsupported schema write format.");
	const schemaChangeCodec: IJsonCodec<SchemaChange, EncodedSchemaChange> = {
		encode: (schemaChange) => {
			assert(
				!schemaChange.isInverse,
				0x933 /* Inverse schema changes should never be transmitted */,
			);
			return {
				new: schemaCodec.json.encode(schemaChange.schema.new) as FormatV1,
				old: schemaCodec.json.encode(schemaChange.schema.old) as FormatV1,
			};
		},
		decode: (encoded) => {
			return {
				schema: {
					new: schemaCodec.json.decode(encoded.new),
					old: schemaCodec.json.decode(encoded.old),
				},
				isInverse: false,
			};
		},
		encodedSchema: EncodedSchemaChange,
	};

	return withSchemaValidation(EncodedSchemaChange, schemaChangeCodec, validator);
}
