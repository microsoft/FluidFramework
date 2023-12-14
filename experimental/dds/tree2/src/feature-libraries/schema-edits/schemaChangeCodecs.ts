/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecOptions, IJsonCodec } from "../../codec";
import { Format, makeSchemaCodec } from "../schemaIndexFormat";
import { SchemaChange } from "./schemaChangeTypes";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodedSchemaChange = {
	readonly new: Format;
	readonly old: Format;
};

export const EncodedSchemaChange = Type.Object({
	new: Type.Optional(Format),
	old: Type.Optional(Format),
});

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
