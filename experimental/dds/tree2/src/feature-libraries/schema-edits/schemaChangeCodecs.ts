/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecOptions, IJsonCodec } from "../../codec";
import { makeSchemaCodec } from "../schemaIndexFormat";
import { EncodedSchemaChange } from "./schemaChangeFormat";
import { SchemaChange } from "./schemaChangeTypes";

export function makeSchemaChangeCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<SchemaChange> {
	const schemaCodec = makeSchemaCodec({ jsonValidator: validator });
	return {
		encode: (schemaChange) => {
			return schemaChange.schema !== undefined
				? {
						new: schemaCodec.encode(schemaChange.schema.new),
						old: schemaCodec.encode(schemaChange.schema.old),
				  }
				: {};
		},
		decode: (json) => {
			const encodedSchemaChange = json as EncodedSchemaChange;
			return {
				schema: {
					new: schemaCodec.decode(encodedSchemaChange.new),
					old: schemaCodec.decode(encodedSchemaChange.old),
				},
			};
		},
		encodedSchema: EncodedSchemaChange,
	};
}
