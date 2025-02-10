/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
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

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV1.js";
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
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset, context: FieldChangeEncodingContext) => {
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

				// When the source of the replace is "self", the destination is a reserved ID that will only be used if
				// the tree in the field is concurrently replaced.
				if (change.valueReplace.isEmpty || change.valueReplace.src === "self") {
					encoded.d = registerIdCodec.encode(change.valueReplace.dst, context.baseContext);
				} else {
					encoded.m.push([
						registerIdCodec.encode("self", context.baseContext),
						registerIdCodec.encode(change.valueReplace.dst, context.baseContext),
						false,
					]);
				}
			}

			if (encoded.m.length === 0) {
				delete encoded.m;
			}

			// XXX

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
			const decoded: Mutable<OptionalChangeset> = {
				// XXX
			};

			if (detached !== undefined && attached !== undefined) {
				if (detached === "self" || attached === "self") {
					assert(
						encoded.d !== undefined,
						0x8d2 /* Invalid change: pin must have a reserved detach ID */,
					);
					const reserved = registerIdCodec.decode(encoded.d, context.baseContext);
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
				const reserved = registerIdCodec.decode(encoded.d, context.baseContext);
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
				const detachId = registerIdCodec.decode(encoded.d, context.baseContext);
				assert(detachId !== "self", 0x8d9 /* Invalid detach ID */);
				decoded.valueReplace = {
					isEmpty: true,
					dst: detachId,
				};
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(EncodedNodeChangeset),
	};
}
