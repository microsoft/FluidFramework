/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IJsonCodec, ICodecOptions, ICodecFamily, makeCodecFamily } from "../../codec";
import { FieldKindIdentifier } from "../../core";
import { Mutable } from "../../util";
import { FieldKindWithEditor } from "./fieldKind";
import { makeModularChangeCodec } from "./modularChangeCodecs";
import { makeSchemaChangeCodec } from "./schemaChangeCodecs";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

export interface EncodedSharedTreeChange {
	readonly modularChange?: ReturnType<ReturnType<typeof makeModularChangeCodec>["encode"]>;
	readonly schemaChange?: ReturnType<ReturnType<typeof makeSchemaChangeCodec>["encode"]>;
}

function makeSharedTreeChangeCodec(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	{ jsonValidator: validator }: ICodecOptions,
): IJsonCodec<SharedTreeChange> {
	const schemaChangeCodec = makeSchemaChangeCodec({ jsonValidator: validator });
	const modularChangeCodec = makeModularChangeCodec(fieldKinds, { jsonValidator: validator });
	return {
		encode: (change) => {
			const encoded: Mutable<EncodedSharedTreeChange> = {};
			if (change.schemaChange !== undefined) {
				encoded.schemaChange = schemaChangeCodec.encode(change.schemaChange);
			}
			if (change.modularChange !== undefined) {
				encoded.modularChange = modularChangeCodec.encode(change.modularChange);
			}
			return encoded;
		},
		decode: (json) => {
			const decodedTreeChange: Mutable<SharedTreeChange> = {};
			const encodedTreeChange = json as EncodedSharedTreeChange;
			if (encodedTreeChange.schemaChange !== undefined) {
				decodedTreeChange.schemaChange = schemaChangeCodec.decode(
					encodedTreeChange.schemaChange,
				);
			}
			if (encodedTreeChange.modularChange !== undefined) {
				decodedTreeChange.modularChange = modularChangeCodec.decode(
					encodedTreeChange.modularChange,
				);
			}
			return decodedTreeChange;
		},
	};
}

export function makeSharedTreeChangeCodecFamily(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange> {
	return makeCodecFamily([[0, makeSharedTreeChangeCodec(fieldKinds, options)]]);
}
