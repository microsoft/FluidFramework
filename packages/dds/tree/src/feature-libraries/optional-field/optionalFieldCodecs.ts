/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec/index.js";
import { EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { Mutable } from "../../util/index.js";
import type { NodeChangeset } from "../modular-schema/index.js";
import type { OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes.js";
import { EncodedOptionalChangeset, EncodedRegisterId } from "./optionalFieldChangeFormat.js";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = <TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<TChildChange>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): ICodecFamily<OptionalChangeset<TChildChange>> =>
	makeCodecFamily([[0, makeOptionalFieldCodec(childCodec, revisionTagCodec)]]);

function makeRegisterIdCodec(
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): IJsonCodec<RegisterId, EncodedRegisterId> {
	return {
		encode: (registerId: RegisterId) => {
			if (registerId === "self") {
				return 0;
			}

			const encodedRegisterId: EncodedRegisterId = { localId: registerId.localId };
			if (registerId.revision !== undefined) {
				encodedRegisterId.revision = revisionTagCodec.encode(registerId.revision);
			}

			return encodedRegisterId;
		},
		decode: (registerId: EncodedRegisterId) => {
			if (registerId === 0) {
				return "self";
			}

			const decodedRegisterId: Mutable<RegisterId> = { localId: registerId.localId };
			if (registerId.revision !== undefined) {
				decodedRegisterId.revision = revisionTagCodec.decode(registerId.revision);
			}

			return decodedRegisterId;
		},
		encodedSchema: EncodedRegisterId,
	};
}

function makeOptionalFieldCodec<TChildChange = NodeChangeset>(
	childCodec: IJsonCodec<TChildChange>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): IJsonCodec<OptionalChangeset<TChildChange>, EncodedOptionalChangeset<TAnySchema>> {
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset<TChildChange>) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.moves.length > 0) {
				encoded.m = [];
				for (const [src, dst, type] of change.moves) {
					encoded.m.push([
						registerIdCodec.encode(src),
						registerIdCodec.encode(dst),
						type === "nodeTargeting",
					]);
				}
			}

			if (change.childChanges.length > 0) {
				encoded.c = [];
				for (const [id, childChange] of change.childChanges) {
					encoded.c.push([registerIdCodec.encode(id), childCodec.encode(childChange)]);
				}
			}

			if (change.reservedDetachId !== undefined) {
				encoded.d = registerIdCodec.encode(change.reservedDetachId);
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>) => {
			const moves: OptionalChangeset["moves"] =
				encoded.m?.map(
					([src, dst, type]) =>
						[
							registerIdCodec.decode(src),
							registerIdCodec.decode(dst),
							type ? ("nodeTargeting" as const) : ("cellTargeting" as const),
						] as const,
				) ?? [];
			const decoded: OptionalChangeset<TChildChange> = {
				moves,
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						registerIdCodec.decode(id),
						childCodec.decode(encodedChange),
					]) ?? [],
			};

			if (encoded.d !== undefined) {
				decoded.reservedDetachId = registerIdCodec.decode(encoded.d);
			}
			return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}
