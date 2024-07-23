/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TAnySchema } from "@sinclair/typebox";

import type { IJsonCodec } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import {
	EncodedNodeChangeset,
	type EncodedChangeAtomId,
	type FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV2.js";
import type { OptionalChangeset, RegisterId, Replace } from "./optionalFieldChangeTypes.js";

function makeRegisterIdCodec(
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): IJsonCodec<RegisterId, EncodedRegisterId, EncodedRegisterId, ChangeEncodingContext> {
	return {
		encode: (registerId: RegisterId, context: ChangeEncodingContext) => {
			if (registerId === "self") {
				return null;
			}
			return changeAtomIdCodec.encode(registerId, context);
		},
		decode: (registerId: EncodedRegisterId, context: ChangeEncodingContext) => {
			if (registerId === null) {
				return "self";
			}
			return changeAtomIdCodec.decode(registerId, context);
		},
		encodedSchema: EncodedRegisterId,
	};
}

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
	const registerIdCodec = makeRegisterIdCodec(changeAtomIdCodec);

	return {
		encode: (change: OptionalChangeset, context: FieldChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};

			if (change.moves.length > 0) {
				encoded.m = change.moves.map(([src, dst]) => [
					changeAtomIdCodec.encode(src, context.baseContext),
					changeAtomIdCodec.encode(dst, context.baseContext),
				]);
			}

			if (change.valueReplace !== undefined) {
				encoded.r = {
					e: change.valueReplace.isEmpty,
					d: changeAtomIdCodec.encode(change.valueReplace.dst, context.baseContext),
				};
				if (change.valueReplace.src !== undefined) {
					encoded.r.s = registerIdCodec.encode(change.valueReplace.src, context.baseContext);
				}
			}

			if (change.childChanges.length > 0) {
				encoded.c = [];
				for (const [id, childChange] of change.childChanges) {
					encoded.c.push([
						registerIdCodec.encode(id, context.baseContext),
						context.encodeNode(childChange),
					]);
				}
			}

			return encoded;
		},

		decode: (
			encoded: EncodedOptionalChangeset<TAnySchema>,
			context: FieldChangeEncodingContext,
		) => {
			const decoded: Mutable<OptionalChangeset> = {
				moves:
					encoded.m?.map(([encodedSrc, encodedDst]) => [
						changeAtomIdCodec.decode(encodedSrc, context.baseContext),
						changeAtomIdCodec.decode(encodedDst, context.baseContext),
					]) ?? [],
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id, context.baseContext),
						context.decodeNode(encodedChange),
					]) ?? [],
			};

			if (encoded.r !== undefined) {
				const replace: Mutable<Replace> = {
					isEmpty: encoded.r.e,
					dst: changeAtomIdCodec.decode(encoded.r.d, context.baseContext),
				};
				if (encoded.r.s !== undefined) {
					replace.src = registerIdCodec.decode(encoded.r.s, context.baseContext);
				}
				decoded.valueReplace = replace;
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(EncodedNodeChangeset),
	};
}
