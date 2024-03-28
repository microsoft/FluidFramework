/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecFamily,
	ICodecOptions,
	IJsonCodec,
	makeCodecFamily,
} from "../../codec/index.js";
import { makeSchemaCodec } from "../schema-index/index.js";
import { EncodedSchemaChange } from "./schemaChangeFormat.js";
import { SchemaChange } from "./schemaChangeTypes.js";

export function makeSchemaChangeCodecs(options: ICodecOptions): ICodecFamily<SchemaChange> {
	return makeCodecFamily([[0, makeSchemaChangeCodec(options)]]);
}

function makeSchemaChangeCodec({
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
