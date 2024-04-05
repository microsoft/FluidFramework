/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { TAnySchema, Type } from "@sinclair/typebox";

import { IJsonCodec } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { JsonCompatibleReadOnly, Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { NodeChangeset } from "../modular-schema/index.js";

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV0.js";
import type { Move, OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes.js";

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
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, context: ChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			encoded.m = [];

			if (change.valueReplace !== undefined) {
				if (change.valueReplace.src !== undefined) {
					encoded.m.push([
						registerIdCodec.encode(change.valueReplace.src, context),
						registerIdCodec.encode("self", context),
						true,
					]);
				}

				// When the source of the replace is "self", the destination is a reserved ID that will only be used if
				// the tree in the field is concurrently replaced.
				if (change.valueReplace.isEmpty || change.valueReplace.src === "self") {
					encoded.d = registerIdCodec.encode(change.valueReplace.dst, context);
				} else {
					encoded.m.push([
						registerIdCodec.encode("self", context),
						registerIdCodec.encode(change.valueReplace.dst, context),
						false,
					]);
				}
			}

			for (const [src, dst] of change.moves) {
				encoded.m.push([
					registerIdCodec.encode(src, context),
					registerIdCodec.encode(dst, context),
					true,
				]);
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
			// The register that the node in the optional field is moved to upon detach
			let detached: RegisterId | undefined;
			// The register that the node is moved from to upon attaching that node in the optional field
			let attached: RegisterId | undefined;
			const moves: Move[] = [];
			if (encoded.m !== undefined) {
				for (const [encodedSrc, encodedDst] of encoded.m) {
					const src = registerIdCodec.decode(encodedSrc, context);
					const dst = registerIdCodec.decode(encodedDst, context);
					if (src === "self" || dst === "self") {
						if (src === "self") {
							assert(detached === undefined, 0x8d0 /* Multiple detached nodes */);
							detached = dst;
						}
						if (dst === "self") {
							assert(attached === undefined, 0x8d1 /* Multiple attached nodes */);
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
						0x8d2 /* Invalid change: pin must have a reserved detach ID */,
					);
					const reserved = registerIdCodec.decode(encoded.d, context);
					assert(reserved !== "self", 0x8d3 /* Invalid reserved detach ID */);
					decoded.valueReplace = { isEmpty: false, dst: reserved, src: "self" };
				} else {
					assert(
						encoded.d === undefined,
						0x8d4 /* Invalid change: unexpected reserved detach ID on a change that detaches a node from the field */,
					);
					decoded.valueReplace = {
						isEmpty: false,
						dst: detached,
						src: attached,
					};
				}
			} else if (attached !== undefined) {
				assert(
					encoded.d !== undefined,
					0x8d5 /* Invalid change: attach must have a reserved detach ID */,
				);
				const reserved = registerIdCodec.decode(encoded.d, context);
				assert(reserved !== "self", 0x8d6 /* Invalid reserved detach ID */);
				decoded.valueReplace = {
					isEmpty: true,
					dst: reserved,
					src: attached,
				};
			} else if (detached !== undefined) {
				assert(
					encoded.d === undefined,
					0x8d7 /* Invalid change: unexpected reserved detach ID on a change that detaches a node from the field */,
				);
				assert(detached !== "self", 0x8d8 /* Invalid detach ID */);
				decoded.valueReplace = {
					isEmpty: false,
					dst: detached,
				};
			} else if (encoded.d !== undefined) {
				const detachId = registerIdCodec.decode(encoded.d, context);
				assert(detachId !== "self", 0x8d9 /* Invalid detach ID */);
				decoded.valueReplace = {
					isEmpty: true,
					dst: detachId,
				};
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
