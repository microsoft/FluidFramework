/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { SessionId } from "@fluidframework/runtime-definitions";
import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec";
import type { NodeChangeset } from "../modular-schema";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes";

export function makeGenericChangeCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<GenericChangeset> {
	return makeCodecFamily([[0, makeV0Codec(childCodec)]]);
}

function makeV0Codec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<GenericChangeset, EncodedGenericChangeset> {
	return {
		encode: (change: GenericChangeset): EncodedGenericChangeset => {
			const encoded: EncodedGenericChangeset = change.map(({ index, nodeChange }) => ({
				index,
				nodeChange: childCodec.encode(nodeChange),
			}));
			return encoded;
		},
		decode: (encoded: EncodedGenericChangeset, originatorId: SessionId): GenericChangeset => {
			return encoded.map(
				({ index, nodeChange }: EncodedGenericChange): GenericChange => ({
					index,
					nodeChange: childCodec.decode(nodeChange, originatorId),
				}),
			);
		},
		encodedSchema: EncodedGenericChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
