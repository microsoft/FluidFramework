/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	eraseEncodedType,
	type ICodecFamily,
	type IJsonCodec,
	makeCodecFamily,
} from "../../codec/index.js";

import type {
	FieldChangeEncodingContext,
	FieldChangeDecodingContext,
} from "./fieldChangeHandler.js";
import { EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import { newGenericChangeset, type GenericChangeset } from "./genericFieldKindTypes.js";
import { EncodedNodeChangeset } from "./modularChangeFormatV1.js";

export function makeGenericChangeCodec(): ICodecFamily<
	GenericChangeset,
	FieldChangeEncodingContext,
	FieldChangeDecodingContext
> {
	return makeCodecFamily([[1, eraseEncodedType(makeV1Codec())]]);
}

function makeV1Codec(): IJsonCodec<
	GenericChangeset,
	EncodedGenericChangeset<typeof EncodedNodeChangeset>,
	EncodedGenericChangeset<typeof EncodedNodeChangeset>,
	FieldChangeEncodingContext,
	FieldChangeDecodingContext
> {
	return {
		encode: (
			change: GenericChangeset,
			context: FieldChangeEncodingContext,
		): EncodedGenericChangeset<typeof EncodedNodeChangeset> => {
			const encoded: EncodedGenericChangeset<typeof EncodedNodeChangeset> = change
				.toArray()
				.map(([index, nodeChange]) => [index, context.encodeNode(nodeChange)]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset<typeof EncodedNodeChangeset>,
			context: FieldChangeDecodingContext,
		): GenericChangeset => {
			return newGenericChangeset(
				encoded.map(([index, nodeChange]) => [index, context.decodeNode(nodeChange)]),
			);
		},
		encodedSchema: EncodedGenericChangeset(EncodedNodeChangeset),
	};
}
