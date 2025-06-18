/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TAnySchema } from "@sinclair/typebox";

import type { IJsonCodec } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import {
	EncodedNodeChangeset,
	type FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import { EncodedOptionalChangeset } from "./optionalFieldChangeFormatV3.js";
import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";

export function makeOptionalFieldCodec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<
	OptionalChangeset,
	EncodedOptionalChangeset<TAnySchema>,
	EncodedOptionalChangeset<TAnySchema>,
	FieldChangeEncodingContext
> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset, context: FieldChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.valueReplace !== undefined) {
				encoded.r = {
					e: change.valueReplace.isEmpty,
					d: changeAtomIdCodec.encode(change.valueReplace.dst, context.baseContext),
				};
				if (change.valueReplace.src !== undefined) {
					encoded.r.s = changeAtomIdCodec.encode(change.valueReplace.src, context.baseContext);
				}
			}

			if (change.nodeDetach !== undefined) {
				encoded.d = changeAtomIdCodec.encode(change.nodeDetach, context.baseContext);
			}

			if (change.childChange !== undefined) {
				encoded.c = context.encodeNode(change.childChange);
			}

			return encoded;
		},

		decode: (
			encoded: EncodedOptionalChangeset<TAnySchema>,
			context: FieldChangeEncodingContext,
		) => {
			const decoded: Mutable<OptionalChangeset> = {};

			if (encoded.r !== undefined) {
				const replace: Mutable<Replace> = {
					isEmpty: encoded.r.e,
					dst: changeAtomIdCodec.decode(encoded.r.d, context.baseContext),
				};
				if (encoded.r.s !== undefined) {
					replace.src = changeAtomIdCodec.decode(encoded.r.s, context.baseContext);
				}
				decoded.valueReplace = replace;
			}

			if (encoded.d !== undefined) {
				decoded.nodeDetach = changeAtomIdCodec.decode(encoded.d, context.baseContext);
			}

			if (encoded.c !== undefined) {
				decoded.childChange = context.decodeNode(encoded.c);
			}

			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(EncodedNodeChangeset),
	};
}
