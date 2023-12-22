/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";

export function makeGenericChangeCodec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<TChildChange>,
): ICodecFamily<GenericChangeset<TChildChange>> {
	return makeCodecFamily([[0, makeV0Codec(childCodec)]]);
}

function makeV0Codec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<TChildChange>,
): IJsonCodec<GenericChangeset<TChildChange>, EncodedGenericChangeset> {
	return {
		encode: (change: GenericChangeset<TChildChange>): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				childCodec.encode(nodeChange),
			]);
			return encoded;
		},
		decode: (encoded: EncodedGenericChangeset): GenericChangeset<TChildChange> => {
			return encoded.map(
				([index, nodeChange]: EncodedGenericChange): GenericChange<TChildChange> => ({
					index,
					nodeChange: childCodec.decode(nodeChange),
				}),
			);
		},
		encodedSchema: EncodedGenericChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
