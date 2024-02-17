/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { JsonCompatibleReadOnly, Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import type { Move, OptionalChangeset, RegisterId, Replace } from "./optionalFieldChangeTypes.js";
import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormat.js";

export const noChangeCodecFamily: ICodecFamily<0, ChangeEncodingContext> = makeCodecFamily<
	0,
	ChangeEncodingContext
>([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeChangeset>(
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
): ICodecFamily<OptionalChangeset<TChildChange>, ChangeEncodingContext> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec, revisionTagCodec)]]);

function makeRegisterIdCodec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<RegisterId, EncodedRegisterId, EncodedRegisterId, ChangeEncodingContext> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
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

function makeOptionalFieldCodec<TChildChange = NodeChangeset>(
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
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, context: ChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			encoded.m = [];
			for (const [src, dst] of change.moves) {
				encoded.m.push([
					registerIdCodec.encode(src, context),
					registerIdCodec.encode(dst, context),
					false,
				]);
			}
			if (change.field !== undefined) {
				if (change.field.isEmpty) {
					encoded.d = registerIdCodec.encode(change.field.dst, context);
				} else {
					encoded.m.push([
						registerIdCodec.encode("self", context),
						registerIdCodec.encode(change.field.dst, context),
						false,
					]);
				}
				if (change.field.src !== undefined) {
					encoded.m.push([
						registerIdCodec.encode(change.field.src, context),
						registerIdCodec.encode("self", context),
						true,
					]);
				}
			}

			if (encoded.m.length === 0) {
				delete encoded.m;
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
			let detached: RegisterId | undefined;
			let attached: RegisterId | undefined;
			const moves: Move[] = [];
			if (encoded.m !== undefined) {
				for (const [encodedSrc, encodedDst] of encoded.m) {
					const src = registerIdCodec.decode(encodedSrc, context);
					const dst = registerIdCodec.decode(encodedDst, context);
					if (src === "self" || dst === "self") {
						if (src === "self") {
							assert(detached === undefined, "Multiple detached nodes");
							detached = dst;
						}
						if (dst === "self") {
							assert(attached === undefined, "Multiple attached nodes");
							attached = src;
						}
					} else {
						moves.push([src, dst]);
					}
				}
			}
			const decoded: Mutable<OptionalChangeset<TChildChange>> = {
				moves,
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id, context),
						childCodec.decode(encodedChange, context),
					]) ?? [],
			};

			if (detached !== undefined && attached !== undefined) {
				if (detached === "self" || attached === "self") {
					assert(
						encoded.d !== undefined,
						"Invalid change: pin must have a reserved detach ID",
					);
					const reserved = registerIdCodec.decode(encoded.d, context);
					assert(reserved !== "self", "Invalid reserved detach ID");
					decoded.field = { isEmpty: false, dst: reserved, src: "self" };
				} else {
					const replace: Mutable<Replace> = {
						isEmpty: encoded.d !== undefined || detached === undefined,
						dst: detached,
					};
					if (attached !== undefined) {
						replace.src = attached;
					}
					decoded.field = replace;
				}
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
