/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import { ChangeEncodingContext } from "../../core/index.js";
import { JsonCompatibleReadOnly } from "../../util/index.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";

export function makeGenericChangeCodec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
): ICodecFamily<GenericChangeset<TChildChange>, ChangeEncodingContext> {
	return makeCodecFamily([[0, makeV0Codec(childCodec)]]);
}

function makeV0Codec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
): IJsonCodec<
	GenericChangeset<TChildChange>,
	EncodedGenericChangeset,
	EncodedGenericChangeset,
	ChangeEncodingContext
> {
	return {
		encode: (
			change: GenericChangeset<TChildChange>,
			context: ChangeEncodingContext,
		): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				childCodec.encode(nodeChange, context),
			]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset,
			context: ChangeEncodingContext,
		): GenericChangeset<TChildChange> => {
			return encoded.map(
				([index, nodeChange]: EncodedGenericChange): GenericChange<TChildChange> => ({
					index,
					nodeChange: childCodec.decode(nodeChange, context),
				}),
			);
		},
		encodedSchema: EncodedGenericChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
