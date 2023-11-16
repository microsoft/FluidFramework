/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { RevisionTag } from "../../core";
import { ICodecFamily, ICodecOptions, IJsonCodec, makeCodecFamily } from "../../codec";
import { Format, makeSchemaCodec } from "../schemaIndexFormat";
import { SchemaChange } from "./schemaChangeTypes";

interface DataEncodedSchemaChange {
	readonly schemaData: ReturnType<ReturnType<typeof makeSchemaCodec>["encode"]>;
}

interface TagEncodedSchemaChange {
	readonly schemaTag: RevisionTag;
}

interface EmptyEncodedSchemaChange {}

export type EncodedSchemaChange =
	| DataEncodedSchemaChange
	| TagEncodedSchemaChange
	| EmptyEncodedSchemaChange;

export const EncodedSchemaChange = Type.Object({
	schemaData: Type.Optional(Format),
	schemaTag: Type.Optional(Type.String()),
});

function isDataEncodedSchemaChange(change: EncodedSchemaChange): change is DataEncodedSchemaChange {
	return (change as DataEncodedSchemaChange).schemaData !== undefined;
}

function isTagEncodedSchemaChange(change: EncodedSchemaChange): change is TagEncodedSchemaChange {
	return (change as TagEncodedSchemaChange).schemaTag !== undefined;
}

export function makeSchemaChangeCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<SchemaChange> {
	const schemaCodec = makeSchemaCodec({ jsonValidator: validator });
	return {
		encode: (schemaChange) => {
			if (typeof schemaChange.newSchema === "object") {
				return { schemaData: schemaCodec.encode(schemaChange.newSchema) };
			}
			return {
				schemaTag: schemaChange.newSchema,
			};
		},
		decode: (json) => {
			const encodedSchemaChange = json as EncodedSchemaChange;
			if (isDataEncodedSchemaChange(encodedSchemaChange)) {
				return {
					newSchema: schemaCodec.decode(encodedSchemaChange.schemaData),
				};
			}
			if (isTagEncodedSchemaChange(encodedSchemaChange)) {
				return {
					newSchema: encodedSchemaChange.schemaTag,
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
