/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IJsonCodec,
	ICodecOptions,
	ICodecFamily,
	makeCodecFamily,
	DiscriminatedUnionDispatcher,
} from "../codec";
import { Mutable } from "../util";
import {
	EncodedModularChangeset,
	ModularChangeset,
	makeSchemaChangeCodec,
} from "../feature-libraries";
import { SharedTreeChange, SharedTreeInnerChange } from "./sharedTreeChangeTypes";
import { EncodedSharedTreeChange, EncodedSharedTreeInnerChange } from "./sharedTreeChangeFormat";

export function makeSharedTreeChangeCodec(
	modularChangeCodec: IJsonCodec<ModularChangeset, EncodedModularChangeset>,
	codecOptions: ICodecOptions,
): IJsonCodec<SharedTreeChange, EncodedSharedTreeChange> {
	const schemaChangeCodec = makeSchemaChangeCodec(codecOptions);

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		EncodedSharedTreeInnerChange,
		[],
		SharedTreeInnerChange
	>({
		data(encoded): SharedTreeInnerChange {
			return {
				type: "data",
				innerChange: modularChangeCodec.decode(encoded),
			};
		},
		schema(encoded): SharedTreeInnerChange {
			return {
				type: "schema",
				innerChange: schemaChangeCodec.decode(encoded),
			};
		},
	});

	return {
		encode: (change) => {
			const changes: EncodedSharedTreeInnerChange[] = [];
			for (const decodedChange of change.changes) {
				if (decodedChange.type === "data") {
					changes.push({
						data: modularChangeCodec.encode(decodedChange.innerChange),
					});
				} else if (decodedChange.type === "schema") {
					changes.push({
						schema: schemaChangeCodec.encode(decodedChange.innerChange),
					});
				}
			}
			return { changes };
		},
		decode: (encodedChange) => {
			const changes: Mutable<SharedTreeChange["changes"]> = [];
			for (const subChange of encodedChange.changes) {
				changes.push(decoderLibrary.dispatch(subChange));
			}
			return { changes };
		},
		encodedSchema: EncodedSharedTreeChange,
	};
}

export function makeSharedTreeChangeCodecFamily(
	modularChangeCodec: IJsonCodec<ModularChangeset, EncodedModularChangeset>,
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange> {
	return makeCodecFamily([[0, makeSharedTreeChangeCodec(modularChangeCodec, options)]]);
}
