/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ICodecFamily, type IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import type { FieldChangeEncodingContext } from "./fieldChangeHandler.js";
import {
	type EncodedGenericChange,
	EncodedGenericChangeset,
} from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";
import { EncodedNodeChangeset } from "./modularChangeFormat.js";

export function makeGenericChangeCodec(): ICodecFamily<
	GenericChangeset,
	FieldChangeEncodingContext
> {
	return makeCodecFamily([[1, makeV1Codec()]]);
}

function makeV1Codec(): IJsonCodec<
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
