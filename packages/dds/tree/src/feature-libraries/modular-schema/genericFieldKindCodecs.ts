/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { SessionId } from "@fluidframework/id-compressor";
import { ICodecFamily, SessionAwareCodec, makeCodecFamily } from "../../codec";
import type { NodeChangeset } from "../modular-schema";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes";

export function makeGenericChangeCodec<TChildChange = NodeChangeset>(
	childCodec: SessionAwareCodec<TChildChange>,
): ICodecFamily<GenericChangeset<TChildChange>, SessionId> {
	return makeCodecFamily([[0, makeV0Codec(childCodec)]]);
}

function makeV0Codec<TChildChange = NodeChangeset>(
	childCodec: SessionAwareCodec<TChildChange>,
): SessionAwareCodec<GenericChangeset<TChildChange>, EncodedGenericChangeset> {
	return {
		encode: (
			change: GenericChangeset<TChildChange>,
			originatorId: SessionId,
		): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => [
				index,
				childCodec.encode(nodeChange, originatorId),
			]);
			return encoded;
		},
		decode: (
			encoded: EncodedGenericChangeset,
			originatorId: SessionId,
		): GenericChangeset<TChildChange> => {
			return encoded.map(
				([index, nodeChange]: EncodedGenericChange): GenericChange<TChildChange> => ({
					index,
					nodeChange: childCodec.decode(nodeChange, originatorId),
				}),
			);
		},
		encodedSchema: EncodedGenericChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
