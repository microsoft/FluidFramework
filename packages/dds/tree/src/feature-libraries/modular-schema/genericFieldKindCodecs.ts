/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import { FieldChangeEncodingContext } from "./fieldChangeHandler.js";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";
import { EncodedNodeChangeset } from "./modularChangeFormat.js";

export function makeGenericChangeCodec(): ICodecFamily<
	GenericChangeset,
	FieldChangeEncodingContext
> {
	return makeCodecFamily([[0, makeV0Codec()]]);
}

function makeV0Codec(): IJsonCodec<
	GenericChangeset,
	EncodedGenericChangeset,
	EncodedGenericChangeset,
	FieldChangeEncodingContext
> {
	return {
		encode: (
			change: GenericChangeset,
			context: FieldChangeEncodingContext,
		): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				context.encodeNode(nodeChange),
			]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset,
			context: FieldChangeEncodingContext,
		): GenericChangeset => {
			return encoded.map(
				([index, nodeChange]: EncodedGenericChange): GenericChange => ({
					index,
					nodeChange: context.decodeNode(nodeChange),
				}),
			);
		},
		encodedSchema: EncodedGenericChangeset(EncodedNodeChangeset),
	};
}
