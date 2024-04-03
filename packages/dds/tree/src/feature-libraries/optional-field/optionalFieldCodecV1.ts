/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";

import { IJsonCodec } from "../../codec/index.js";
import {
	ChangeAtomId,
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import { JsonCompatibleReadOnly, Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { EncodedChangeAtomId, NodeChangeset } from "../modular-schema/index.js";

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV1.js";
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

export function makeOptionalFieldCodec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<
	OptionalChangeset<TChildChange>,
	EncodedOptionalChangeset<TAnySchema>,
	EncodedOptionalChangeset<TAnySchema>,
	ChangeEncodingContext
> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	const registerIdCodec = makeRegisterIdCodec(changeAtomIdCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, context: ChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};

			if (change.moves.length > 0) {
				encoded.m = change.moves.map(([src, dst]) => [
					changeAtomIdCodec.encode(src, context),
					changeAtomIdCodec.encode(dst, context),
				]);
			}

			if (change.valueReplace !== undefined) {
				encoded.r = {
					e: change.valueReplace.isEmpty,
					d: changeAtomIdCodec.encode(change.valueReplace.dst, context),
				};
				if (change.valueReplace.src !== undefined) {
					encoded.r.s = registerIdCodec.encode(change.valueReplace.src, context);
				}
			}

			if (change.childChanges.length > 0) {
				encoded.c = [];
				for (const [id, childChange] of change.childChanges) {
					encoded.c.push([
						registerIdCodec.encode(id, context),
						childCodec.encode(childChange, context),
					]);
				}
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>, context: ChangeEncodingContext) => {
			const decoded: Mutable<OptionalChangeset<TChildChange>> = {
				moves:
					encoded.m?.map(([encodedSrc, encodedDst]) => [
						changeAtomIdCodec.decode(encodedSrc, context),
						changeAtomIdCodec.decode(encodedDst, context),
					]) ?? [],
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id, context),
						childCodec.decode(encodedChange, context),
					]) ?? [],
			};

			if (encoded.r !== undefined) {
				const replace: Mutable<Replace> = {
					isEmpty: encoded.r.e,
					dst: changeAtomIdCodec.decode(encoded.r.d, context),
				};
				if (encoded.r.s !== undefined) {
					replace.src = registerIdCodec.decode(encoded.r.s, context);
				}
				decoded.valueReplace = replace;
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
