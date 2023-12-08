/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionId } from "@fluidframework/runtime-definitions";
import { TAnySchema, Type } from "@sinclair/typebox";
import { decodeChangeAtomId, encodeChangeAtomId } from "../utils";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec";
import { EncodedRevisionTag, RevisionTag } from "../../core";
import { Mutable } from "../../util";
import type { NodeChangeset } from "../modular-schema";
import type { OptionalChangeset, RegisterId } from "./optionalFieldChangeTypes";
import {
	EncodedOptionalChangeset,
	EncodedRegisterId,
	EncodedBuild,
} from "./optionalFieldChangeFormat";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): ICodecFamily<OptionalChangeset> =>
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
		decode: (registerId: EncodedRegisterId, originatorId: SessionId) => {
			if (registerId === 0) {
				return "self";
			}

			const decodedRegisterId: Mutable<RegisterId> = { localId: registerId.localId };
			if (registerId.revision !== undefined) {
				decodedRegisterId.revision = revisionTagCodec.decode(
					registerId.revision,
					originatorId,
				);
			}

			return decodedRegisterId;
		},
		encodedSchema: EncodedRegisterId,
	};
}

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): IJsonCodec<OptionalChangeset, EncodedOptionalChangeset<TAnySchema>> {
	const registerIdCodec = makeRegisterIdCodec(revisionTagCodec);

	return {
		encode: (change: OptionalChangeset) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.build.length > 0) {
				const builds: EncodedBuild[] = [];
				for (const build of change.build) {
					builds.push([encodeChangeAtomId(revisionTagCodec, build.id), build.set]);
				}
				encoded.b = builds;
			}

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
			const decoded: OptionalChangeset = {
				build:
					encoded.b?.map(([id, set]) => {
						return {
							id: decodeChangeAtomId(revisionTagCodec, originatorId, id),
							set,
						};
					}) ?? [],
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
