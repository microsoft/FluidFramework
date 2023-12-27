/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { SessionId } from "@fluidframework/id-compressor";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import { JsonCompatibleReadOnly } from "../../util/utils.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat.js";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes.js";

export function makeGenericChangeCodec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		{ originatorId: SessionId }
	>,
): ICodecFamily<GenericChangeset<TChildChange>, { originatorId: SessionId }> {
	return makeCodecFamily([[0, makeV0Codec(childCodec)]]);
}

function makeV0Codec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		{ originatorId: SessionId }
	>,
): IJsonCodec<
	GenericChangeset<TChildChange>,
	EncodedGenericChangeset,
	EncodedGenericChangeset,
	{ originatorId: SessionId }
> {
	return {
		encode: (
			change: GenericChangeset<TChildChange>,
			context: { originatorId: SessionId },
		): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				childCodec.encode(nodeChange, context),
			]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset,
			context: { originatorId: SessionId },
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
