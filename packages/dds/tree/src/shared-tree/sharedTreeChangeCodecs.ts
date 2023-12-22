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
} from "../codec/index.js";
import { ChangeEncodingContext } from "../core/index.js";
import { Mutable } from "../util/index.js";
import {
	EncodedModularChangeset,
	ModularChangeset,
	makeSchemaChangeCodec,
} from "../feature-libraries/index.js";
import { SharedTreeChange, SharedTreeInnerChange } from "./sharedTreeChangeTypes.js";
import { EncodedSharedTreeChange, EncodedSharedTreeInnerChange } from "./sharedTreeChangeFormat.js";

export function makeSharedTreeChangeCodec(
	modularChangeCodec: IJsonCodec<
		ModularChangeset,
		EncodedModularChangeset,
		EncodedModularChangeset,
		ChangeEncodingContext
	>,
	codecOptions: ICodecOptions,
): IJsonCodec<
	SharedTreeChange,
	EncodedSharedTreeChange,
	EncodedSharedTreeChange,
	ChangeEncodingContext
> {
	const schemaChangeCodec = makeSchemaChangeCodec(codecOptions);

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		EncodedSharedTreeInnerChange,
		[context: ChangeEncodingContext],
		SharedTreeInnerChange
	>({
		data(encoded, context): SharedTreeInnerChange {
			return {
				type: "data",
				innerChange: modularChangeCodec.decode(encoded, context),
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
		encode: (change, context) => {
			const changes: EncodedSharedTreeInnerChange[] = [];
			for (const decodedChange of change.changes) {
				if (decodedChange.type === "data") {
					changes.push({
						data: modularChangeCodec.encode(decodedChange.innerChange, context),
					});
				} else if (decodedChange.type === "schema") {
					changes.push({
						schema: schemaChangeCodec.encode(decodedChange.innerChange),
					});
				}
			}
			return changes;
		},
		decode: (encodedChange, context) => {
			const changes: Mutable<SharedTreeChange["changes"]> = [];
			for (const subChange of encodedChange) {
				changes.push(decoderLibrary.dispatch(subChange, context));
			}
			return { changes };
		},
		encodedSchema: EncodedSharedTreeChange,
	};
}

export function makeSharedTreeChangeCodecFamily(
	modularChangeCodec: IJsonCodec<
		ModularChangeset,
		EncodedModularChangeset,
		EncodedModularChangeset,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
): ICodecFamily<SharedTreeChange, ChangeEncodingContext> {
	return makeCodecFamily([[0, makeSharedTreeChangeCodec(modularChangeCodec, options)]]);
}
