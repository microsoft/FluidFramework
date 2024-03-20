/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import type { FieldChangeEncodingContext, NodeId } from "../modular-schema/index.js";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";

export function makeGenericChangeCodec<TChildChange = NodeId>(): ICodecFamily<
	GenericChangeset<TChildChange>,
	FieldChangeEncodingContext
> {
	return makeCodecFamily([[0, makeV0Codec()]]);
}

function makeV0Codec<TChildChange = NodeId>(): IJsonCodec<
	GenericChangeset<TChildChange>,
	EncodedGenericChangeset,
	EncodedGenericChangeset,
	FieldChangeEncodingContext
> {
	return {
		encode: (
			change: GenericChangeset<TChildChange>,
			context: FieldChangeEncodingContext,
		): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				// XXX
				context.encodeNode(nodeChange as NodeId),
			]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset,
			context: FieldChangeEncodingContext,
		): GenericChangeset<TChildChange> => {
			return encoded.map(
				([index, nodeChange]: EncodedGenericChange): GenericChange<TChildChange> => ({
					index,
					// XXX
					nodeChange: context.decodeNode(nodeChange) as TChildChange,
				}),
			);
		},
		// XXX
		encodedSchema: Type.Any(),
	};
}
