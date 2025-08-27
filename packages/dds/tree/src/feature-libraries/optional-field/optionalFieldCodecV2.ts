/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TAnySchema } from "@sinclair/typebox";

import type { IJsonCodec } from "../../codec/index.js";
import {
	areEqualChangeAtomIdOpts,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type EncodedRevisionTag,
	type RevisionTag,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import {
	EncodedNodeChangeset,
	type EncodedChangeAtomId,
	type FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormatV2.js";
import type { OptionalChangeset, Replace } from "./optionalFieldChangeTypes.js";
import { assert } from "@fluidframework/core-utils/internal";

type RegisterId = ChangeAtomId | "self";

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
			assert(
				change.nodeDetach === undefined ||
					areEqualChangeAtomIdOpts(change.valueReplace?.src, change.nodeDetach),
				"This format only supports node detach when it represents a pin",
			);

			const encoded: EncodedOptionalChangeset<TAnySchema> = {};

			if (change.valueReplace !== undefined) {
				encoded.r = {
					e: change.valueReplace.isEmpty,
					d: changeAtomIdCodec.encode(change.valueReplace.dst, context.baseContext),
				};
				if (change.valueReplace.src !== undefined) {
					const srcRegister =
						change.nodeDetach === undefined ? change.valueReplace.src : "self";

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
				const firstNode = encoded.c[0];
				assert(
					firstNode !== undefined && encoded.c.length === 1,
					"Expected exactly one child change",
				);
				decoded.childChange = context.decodeNode(firstNode[1]);
			}

			for (const [encodedOldId, encodedNewId] of encoded.m ?? []) {
				context.decodeRootRename(
					changeAtomIdCodec.decode(encodedOldId, context.baseContext),
					changeAtomIdCodec.decode(encodedNewId, context.baseContext),
					1,
				);
			}

			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(EncodedNodeChangeset),
	};
}
