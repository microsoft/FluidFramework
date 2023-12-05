/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, ICodecOptions, IJsonCodec, makeCodecFamily } from "../../codec";
import { Format, makeSchemaCodec } from "../schemaIndexFormat";
import { SchemaChange } from "./schemaChangeTypes";

interface DataEncodedSchemaChange {
	readonly new: Format;
	readonly old: Format;
}

interface EmptyEncodedSchemaChange {}

export type EncodedSchemaChange = DataEncodedSchemaChange | EmptyEncodedSchemaChange;

export const EncodedSchemaChange = Type.Object({
	new: Type.Optional(Format),
	old: Type.Optional(Format),
});

function isDataEncodedSchemaChange(change: EncodedSchemaChange): change is DataEncodedSchemaChange {
	return (change as DataEncodedSchemaChange).new !== undefined;
}

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
			if (isDataEncodedSchemaChange(encodedSchemaChange)) {
				return {
					schema: {
						new: schemaCodec.decode(encodedSchemaChange.new),
						old: schemaCodec.decode(encodedSchemaChange.old),
					},
				};
			}
			return {};
		},
		encodedSchema: EncodedSchemaChange,
	};
}

export function makeSchemaChangeCodecFamily(options: ICodecOptions): ICodecFamily<SchemaChange> {
	return makeCodecFamily([[0, makeSchemaChangeCodec(options)]]);
}
