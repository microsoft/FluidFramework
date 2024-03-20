/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { assert } from "@fluidframework/core-utils";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { FieldChangeEncodingContext, NodeId } from "../modular-schema/index.js";
import type { Move, OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes.js";
import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormat.js";

export const noChangeCodecFamily: ICodecFamily<0, FieldChangeEncodingContext> = makeCodecFamily<
	0,
	FieldChangeEncodingContext
>([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeId>(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): ICodecFamily<OptionalChangeset<TChildChange>, FieldChangeEncodingContext> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(revisionTagCodec)]]);

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

function makeOptionalFieldCodec<TChildChange = NodeId>(
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
	FieldChangeEncodingContext
> {
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, context: FieldChangeEncodingContext) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			encoded.m = [];

			if (change.valueReplace !== undefined) {
				if (change.valueReplace.src !== undefined) {
					encoded.m.push([
						registerIdCodec.encode(change.valueReplace.src, context.baseContext),
						registerIdCodec.encode("self", context.baseContext),
						true,
					]);
				}

				if (change.valueReplace.isEmpty) {
					encoded.d = registerIdCodec.encode(
						change.valueReplace.dst,
						context.baseContext,
					);
				} else {
					encoded.m.push([
						registerIdCodec.encode("self", context.baseContext),
						registerIdCodec.encode(change.valueReplace.dst, context.baseContext),
						false,
					]);
				}
			}

			for (const [src, dst] of change.moves) {
				encoded.m.push([
					registerIdCodec.encode(src, context.baseContext),
					registerIdCodec.encode(dst, context.baseContext),
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
						registerIdCodec.encode(id, context.baseContext),
						// XXX
						context.encodeNode(childChange as NodeId),
					]);
				}
			}

			return encoded;
		},

		decode: (
			encoded: EncodedOptionalChangeset<TAnySchema>,
			context: FieldChangeEncodingContext,
		) => {
			// The register that the node in the optional field is moved to upon detach
			let detached: RegisterId | undefined;
			// The register that the node is moved from to upon attaching that node in the optional field
			let attached: RegisterId | undefined;
			const moves: Move[] = [];
			if (encoded.m !== undefined) {
				for (const [encodedSrc, encodedDst] of encoded.m) {
					const src = registerIdCodec.decode(encodedSrc, context.baseContext);
					const dst = registerIdCodec.decode(encodedDst, context.baseContext);
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
						registerIdCodec.decode(id, context.baseContext),
						// XXX
						context.decodeNode(encodedChange) as TChildChange,
					]) ?? [],
			};

			if (detached !== undefined && attached !== undefined) {
				if (detached === "self" || attached === "self") {
					assert(
						encoded.d !== undefined,
						"Invalid change: pin must have a reserved detach ID",
					);
					const reserved = registerIdCodec.decode(encoded.d, context.baseContext);
					assert(reserved !== "self", "Invalid reserved detach ID");
					decoded.valueReplace = { isEmpty: false, dst: reserved, src: "self" };
				} else {
					assert(
						encoded.d === undefined,
						"Invalid change: unexpected reserved detach ID on a change that detaches a node from the field",
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
					"Invalid change: attach must have a reserved detach ID",
				);
				const reserved = registerIdCodec.decode(encoded.d, context.baseContext);
				assert(reserved !== "self", "Invalid reserved detach ID");
				decoded.valueReplace = {
					isEmpty: true,
					dst: reserved,
					src: attached,
				};
			} else if (detached !== undefined) {
				assert(
					encoded.d === undefined,
					"Invalid change: unexpected reserved detach ID on a change that detaches a node from the field",
				);
				assert(detached !== "self", "Invalid detach ID");
				decoded.valueReplace = {
					isEmpty: false,
					dst: detached,
				};
			} else if (encoded.d !== undefined) {
				const detachId = registerIdCodec.decode(encoded.d, context.baseContext);
				assert(detachId !== "self", "Invalid detach ID");
				decoded.valueReplace = {
					isEmpty: true,
					dst: detachId,
				};
			}
			return decoded;
		},
		// XXX
		encodedSchema: EncodedOptionalChangeset(Type.Any()),
	};
}
