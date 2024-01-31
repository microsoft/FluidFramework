/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecOptions, IJsonCodec } from "../../codec/index.js";
import { makeSchemaCodec } from "../schema-index/index.js";
import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import { SchemaChange } from "./schemaChangeTypes.js";

export function makeSchemaChangeCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<SchemaChange, EncodedSchemaChange> {
	const schemaCodec = makeSchemaCodec({ jsonValidator: validator });
	return {
		encode: (schemaChange) => {
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
			};
		},
		encodedSchema: EncodedSchemaChange,
	};
}
