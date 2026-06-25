/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import type { IJsonCodec, JsonCodecPart } from "../../codec/index.js";
import {
	areEqualChangeAtomIdOpts,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type EncodedChangeAtomId,
	type RevisionTag,
	type RevisionTagSchema,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { FieldChangeEncodingContext } from "../modular-schema/index.js";
import { EncodedNodeChangeset } from "../modular-schema/index.js";

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV2.js";
import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";

type RegisterId = ChangeAtomId | "self";

function makeRegisterIdCodec(
	changeAtomIdCodec: JsonCodecPart<
		ChangeAtomId,
		typeof EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): JsonCodecPart<RegisterId, typeof EncodedRegisterId, ChangeEncodingContext> {
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
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
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

			assert(
				change.nodeDetach === undefined ||
					areEqualChangeAtomIdOpts(
						context.getOutputRootId(change.nodeDetach, 1).value ?? change.nodeDetach,
						change.valueReplace?.src,
					),
				"Node-targeting detaches are not supported in this codec version, unless they are part of a pin",
			);

			if (change.valueReplace !== undefined) {
				const srcRegister = getSrcRegister(change, context);

				// We inline any rename into the detach, as older clients do not support detach and rename.
				const dstOutputId =
					context.getOutputRootId(change.valueReplace.dst, 1).value ?? change.valueReplace.dst;

				encoded.r = {
					e: change.valueReplace.isEmpty,
					d: changeAtomIdCodec.encode(dstOutputId, context.baseContext),
				};

				if (srcRegister !== undefined) {
					encoded.r.s = registerIdCodec.encode(srcRegister, context.baseContext);
				}
			}

			const encodedChildChanges: [EncodedRegisterId, EncodedNodeChangeset][] = [];

			if (change.childChange !== undefined) {
				encodedChildChanges.push([null, context.encodeNode(change.childChange)]);
			}

			for (const [detachId, nodeId] of context.rootNodeChanges.entries()) {
				encodedChildChanges.push([
					changeAtomIdCodec.encode(
						{ revision: detachId[0], localId: detachId[1] },
						context.baseContext,
					),
					context.encodeNode(nodeId),
				]);
			}

			if (encodedChildChanges.length > 0) {
				encoded.c = encodedChildChanges;
			}

			const encodedMoves: [EncodedChangeAtomId, EncodedChangeAtomId][] = [];
			for (const {
				start: oldId,
				value: newId,
				length: count,
			} of context.rootRenames.entries()) {
				if (
					areEqualChangeAtomIdOpts(oldId, change.valueReplace?.dst) ||
					areEqualChangeAtomIdOpts(newId, change.valueReplace?.src)
				) {
					// This rename will be inlined into the encoded replace.
					continue;
				}
				assert(count === 1, "Unexpected range rename in optional field");
				encodedMoves.push([
					changeAtomIdCodec.encode(oldId, context.baseContext),
					changeAtomIdCodec.encode(newId, context.baseContext),
				]);
			}

			if (encodedMoves.length > 0) {
				encoded.m = encodedMoves;
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
					const register = registerIdCodec.decode(encoded.r.s, context.baseContext);
					// An attach should have a detach, but since a detach ID cannot be encoded in this format, we generate one here.
					// Note that this is safe as long as we assume that this change will not be rebased over a move to a sequence field.
					// The ID of an attach and accompanying detach/rename is arbitrary, except in sequence field where
					// the ID of the detach becomes a cell ID which may be referenced by other changes.
					replace.src = context.generateId();
					if (register === "self") {
						decoded.nodeDetach = replace.src;
					} else {
						context.decodeRootRename(register, replace.src, 1, undefined, false);
					}
				}
				decoded.valueReplace = replace;
			}

			if (encoded.c !== undefined) {
				for (const [encodedDetachId, nodeChange] of encoded.c) {
					if (encodedDetachId === null) {
						decoded.childChange = context.decodeNode(nodeChange);
					} else {
						context.decodeRootNodeChange(
							changeAtomIdCodec.decode(encodedDetachId, context.baseContext),
							nodeChange,
						);
					}
				}
			}

			for (const [encodedOldId, encodedNewId] of encoded.m ?? []) {
				context.decodeRootRename(
					changeAtomIdCodec.decode(encodedOldId, context.baseContext),
					changeAtomIdCodec.decode(encodedNewId, context.baseContext),
					1,
					undefined,
					false,
				);
			}

			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(EncodedNodeChangeset),
	};
}

function getSrcRegister(
	change: OptionalChangeset,
	context: FieldChangeEncodingContext,
): RegisterId | undefined {
	if (change.valueReplace?.src === undefined) {
		return undefined;
	}

	if (change.nodeDetach !== undefined) {
		// Node detach is only supported when it is part of a pin.
		return "self";
	}

	// We inline the rename into the attach, as older clients do not support rename and attach.
	return context.getInputRootId(change.valueReplace.src, 1).value ?? change.valueReplace.src;
}
