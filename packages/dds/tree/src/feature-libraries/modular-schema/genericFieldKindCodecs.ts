/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, IJsonCodec, makeCodecFamily } from "../../codec";
import { JsonCompatibleReadOnly } from "../../util";
import type { NodeChangeset } from "../modular-schema";
import { EncodedGenericChange, EncodedGenericChangeset } from "./genericFieldKindFormat";
import type { GenericChange, GenericChangeset } from "./genericFieldKindTypes";

export function makeGenericChangeCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<GenericChangeset> {
	return makeCodecFamily([
		[
			0,
			{
				encode: (change: GenericChangeset): JsonCompatibleReadOnly => {
					const encoded: JsonCompatibleReadOnly[] & EncodedGenericChangeset = change.map(
						({ index, nodeChange }) => ({
							index,
							nodeChange: childCodec.encode(nodeChange),
						}),
					);
					return encoded;
				},
				decode: (change: JsonCompatibleReadOnly): GenericChangeset => {
					const encoded = change as JsonCompatibleReadOnly[] & EncodedGenericChangeset;
					return encoded.map(
						({ index, nodeChange }: EncodedGenericChange): GenericChange => ({
							index,
							nodeChange: childCodec.decode(nodeChange),
						}),
					);
				},
				encodedSchema: EncodedGenericChangeset,
			},
		],
	]);
}
