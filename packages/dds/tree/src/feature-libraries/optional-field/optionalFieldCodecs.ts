/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { JsonCompatibleReadOnly } from "../../util/utils.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import type { OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes.js";
import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormat.js";

export const noChangeCodecFamily: ICodecFamily<0, { originatorId: SessionId }> = makeCodecFamily<
	0,
	{ originatorId: SessionId }
>([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<
		TChildChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		{ originatorId: SessionId }
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		{ originatorId: SessionId }
	>,
): ICodecFamily<OptionalChangeset<TChildChange>, { originatorId: SessionId }> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec, revisionTagCodec)]]);

function makeRegisterIdCodec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		{ originatorId: SessionId }
	>,
): IJsonCodec<RegisterId, EncodedRegisterId, EncodedRegisterId, { originatorId: SessionId }> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	return {
		encode: (registerId: RegisterId, context: { originatorId: SessionId }) => {
			if (registerId === "self") {
				return null;
			}
			return changeAtomIdCodec.encode(registerId, context);
		},
		decode: (registerId: EncodedRegisterId, context: { originatorId: SessionId }) => {
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
		{ originatorId: SessionId }
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		{ originatorId: SessionId }
	>,
): IJsonCodec<
	OptionalChangeset<TChildChange>,
	EncodedOptionalChangeset<TAnySchema>,
	EncodedOptionalChangeset<TAnySchema>,
	{ originatorId: SessionId }
> {
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, context: { originatorId: SessionId }) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.moves.length > 0) {
				encoded.m = [];
				for (const [src, dst, type] of change.moves) {
					encoded.m.push([
						registerIdCodec.encode(src, context),
						registerIdCodec.encode(dst, context),
						type === "nodeTargeting",
					]);
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

			if (change.reservedDetachId !== undefined) {
				encoded.d = registerIdCodec.encode(change.reservedDetachId, context);
			}

			return encoded;
		},

		decode: (
			encoded: EncodedOptionalChangeset<TAnySchema>,
			context: { originatorId: SessionId },
		) => {
			const moves: OptionalChangeset["moves"] =
				encoded.m?.map(
					([src, dst, type]) =>
						[
							registerIdCodec.decode(src, context),
							registerIdCodec.decode(dst, context),
							type ? ("nodeTargeting" as const) : ("cellTargeting" as const),
						] as const,
				) ?? [];
			const decoded: OptionalChangeset<TChildChange> = {
				moves,
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id, context),
						childCodec.decode(encodedChange, context),
					]) ?? [],
			};

			if (encoded.d !== undefined) {
				decoded.reservedDetachId = registerIdCodec.decode(encoded.d, context);
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
