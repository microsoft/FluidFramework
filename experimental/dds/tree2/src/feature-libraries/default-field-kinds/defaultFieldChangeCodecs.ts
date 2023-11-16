/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec";
import type { NodeChangeset } from "../modular-schema";
import type { RegisterId, OptionalChangeset } from "./defaultFieldChangeTypes";
import {
	EncodedBuild,
	EncodedRegisterId,
	EncodedOptionalChangeset,
} from "./defaultFieldChangeFormat";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<OptionalChangeset> => makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

const registerIdCodec: IJsonCodec<RegisterId, EncodedRegisterId> = {
	encode: (registerId: RegisterId) => {
		if (registerId === "self") {
			return 0;
		}

		return { ...registerId };
	},
	decode: (registerId: EncodedRegisterId) => {
		if (registerId === 0) {
			return "self";
		}

		return { ...registerId };
	},
};

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<OptionalChangeset, EncodedOptionalChangeset<TAnySchema>> {
	return {
		encode: (change: OptionalChangeset) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.build.length > 0) {
				const builds: EncodedBuild[] = [];
				for (const build of change.build) {
					builds.push({
						id: build.id,
						set: build.set,
					});
				}
				encoded.b = builds;
			}

			if (change.moves.length > 0) {
				encoded.m = [];
				for (const [src, dst, type] of change.moves) {
					encoded.m.push([
						registerIdCodec.encode(src),
						registerIdCodec.encode(dst),
						// TODO: omit sometimes
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
			const decoded: OptionalChangeset = {
				build: encoded.b ?? [],
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
