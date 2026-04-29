/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import type { IJsonCodec, JsonCodecPart } from "../../codec/index.js";
import {
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type EncodedRevisionTag,
	type RevisionTag,
	type RevisionTagSchema,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type {
	FieldChangeEncodingContext,
	EncodedChangeAtomId,
} from "../modular-schema/index.js";
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

			if (change.valueReplace !== undefined || change.nodeDetach !== undefined) {
				// If the value replace is undefined, then there must be a node detach, implying that the field is not empty.
				const isEmpty = change.valueReplace?.isEmpty ?? false;
				const srcRegister = getSrcRegister(change, context);

				// If this is a not a pin, we treat nodeDetach as if it were the clear ID.
				const dst =
					srcRegister === "self"
						? (change.valueReplace?.dst ?? fail("Value replace should be defined for a pin"))
						: (change.nodeDetach ??
							change.valueReplace?.dst ??
							fail("Either the value replace or node detach should be defined"));

				encoded.r = {
					e: isEmpty,
					d: changeAtomIdCodec.encode(dst, context.baseContext),
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
					if (register === "self") {
						// Note that this is safe as long as we assume that this change will not be rebased
						// over a move to a sequence field.
						// The ID of an attach and accompanying detach/rename is arbitrary, except in sequence field where
						// the ID of the detach becomes a cell ID which may be referenced by other changes.
						replace.src = context.generateId();
						decoded.nodeDetach = replace.src;
					} else {
						replace.src = register;
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
		const attachId = context.getOutputRootId(change.nodeDetach, 1).value ?? change.nodeDetach;
		if (areEqualChangeAtomIds(attachId, change.valueReplace.src)) {
			return "self";
		}
	}

	return change.valueReplace.src;
}
