/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/id-compressor";
import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, SessionAwareCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import type { OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes.js";
import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormat.js";

export const noChangeCodecFamily: ICodecFamily<0, SessionId> = makeCodecFamily<0, SessionId>([
	[0, unitCodec],
]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeChangeset>(
	childCodec: SessionAwareCodec<TChildChange>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): ICodecFamily<OptionalChangeset<TChildChange>, SessionId> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec, revisionTagCodec)]]);

function makeRegisterIdCodec(
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): SessionAwareCodec<RegisterId, EncodedRegisterId> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	return {
		encode: (registerId: RegisterId, originatorId: SessionId) => {
			if (registerId === "self") {
				return null;
			}
			return changeAtomIdCodec.encode(registerId, originatorId);
		},
		decode: (registerId: EncodedRegisterId, originatorId: SessionId) => {
			if (registerId === null) {
				return "self";
			}
			return changeAtomIdCodec.decode(registerId, originatorId);
		},
		encodedSchema: EncodedRegisterId,
	};
}

function makeOptionalFieldCodec<TChildChange = NodeChangeset>(
	childCodec: SessionAwareCodec<TChildChange>,
	revisionTagCodec: SessionAwareCodec<RevisionTag, EncodedRevisionTag>,
): SessionAwareCodec<OptionalChangeset<TChildChange>, EncodedOptionalChangeset<TAnySchema>> {
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>, originatorId: SessionId) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.moves.length > 0) {
				encoded.m = [];
				for (const [src, dst, type] of change.moves) {
					encoded.m.push([
						registerIdCodec.encode(src, originatorId),
						registerIdCodec.encode(dst, originatorId),
						type === "nodeTargeting",
					]);
				}
			}

			if (change.childChanges.length > 0) {
				encoded.c = [];
				for (const [id, childChange] of change.childChanges) {
					encoded.c.push([
						registerIdCodec.encode(id, originatorId),
						childCodec.encode(childChange, originatorId),
					]);
				}
			}

			if (change.reservedDetachId !== undefined) {
				encoded.d = registerIdCodec.encode(change.reservedDetachId, originatorId);
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>, originatorId: SessionId) => {
			const moves: OptionalChangeset["moves"] =
				encoded.m?.map(
					([src, dst, type]) =>
						[
							registerIdCodec.decode(src, originatorId),
							registerIdCodec.decode(dst, originatorId),
							type ? ("nodeTargeting" as const) : ("cellTargeting" as const),
						] as const,
				) ?? [];
			const decoded: OptionalChangeset<TChildChange> = {
				moves,
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id, originatorId),
						childCodec.decode(encodedChange, originatorId),
					]) ?? [],
			};

			if (encoded.d !== undefined) {
				decoded.reservedDetachId = registerIdCodec.decode(encoded.d, originatorId);
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
