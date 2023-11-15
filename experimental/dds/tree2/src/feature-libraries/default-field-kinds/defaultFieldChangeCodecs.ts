/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec";
import { JsonCompatibleReadOnly, Mutable } from "../../util";
import type { NodeChangeset } from "../modular-schema";
import type {
	ContentId,
	NodeUpdate,
	OptionalChangeset,
	OptionalFieldChange,
} from "./defaultFieldChangeTypes";
import {
	EncodedBuild,
	EncodedContentId,
	EncodedOptionalChangeset,
} from "./defaultFieldChangeFormat";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<OptionalChangeset> => makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

const contentIdCodec: IJsonCodec<ContentId, EncodedContentId> = {
	encode: (contentId: ContentId) =>
		contentId === "self" ? 0 : { localId: contentId.localId, revision: contentId.revision },
	decode: (contentId: EncodedContentId) =>
		contentId === 0 ? "self" : { localId: contentId.localId, revision: contentId.revision },
};

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<OptionalChangeset, EncodedOptionalChangeset<TAnySchema>> {
	// const nodeUpdateCodec = makeNodeUpdateCodec(childCodec);
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
						contentIdCodec.encode(src),
						contentIdCodec.encode(dst),
						// TODO: omit sometimes
						type === "nodeTargeting",
					]);
				}
			}

			if (change.childChanges.length > 0) {
				encoded.c = [];
				for (const [id, childChange] of change.childChanges) {
					encoded.c.push([contentIdCodec.encode(id), childCodec.encode(childChange)]);
				}
			}

			if (change.reservedDetachId !== undefined) {
				encoded.d = contentIdCodec.encode(change.reservedDetachId);
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>) => {
			const moves: OptionalChangeset["moves"] =
				encoded.m?.map(
					([src, dst, type]) =>
						[
							contentIdCodec.decode(src),
							contentIdCodec.decode(dst),
							type ? ("nodeTargeting" as const) : ("cellTargeting" as const),
						] as const,
				) ?? [];
			return {
				build: encoded.b ?? [], // TODO: worth it to copy here?
				moves,
				childChanges:
					encoded.c?.map(([id, encodedChange]) => [
						contentIdCodec.decode(id),
						childCodec.decode(encodedChange),
					]) ?? [],
				reservedDetachId:
					encoded.d !== undefined ? contentIdCodec.decode(encoded.d) : undefined,
			};
			// const decoded: Mutable<OptionalChangeset> = {
			// 	fieldChanges: [],
			// 	// contentId: { id: "this", type: "after" },
			// } as any;
			// if (encoded.fieldChange !== undefined) {
			// 	const decodedFieldChange: Mutable<OptionalFieldChange> = {
			// 		id: encoded.fieldChange.id,
			// 		wasEmpty: encoded.fieldChange.wasEmpty,
			// 		inserted: { type: "after", id: "this" },
			// 		removed: { type: "before", id: "this" },
			// 	};
			// 	if (encoded.fieldChange.revision !== undefined) {
			// 		decodedFieldChange.revision = encoded.fieldChange.revision;
			// 	}
			// 	if (encoded.fieldChange.newContent !== undefined) {
			// 		decodedFieldChange.newContent = nodeUpdateCodec.decode(
			// 			encoded.fieldChange.newContent,
			// 		);
			// 	}
			// 	decoded.fieldChanges.push(decodedFieldChange);
			// }

			// if (encoded.childChanges !== undefined) {
			// 	decoded.childChanges = encoded.childChanges.map(([id, childChange]) => [
			// 		{ id, type: "after" },
			// 		childCodec.decode(childChange),
			// 	]);
			// }

			// return decoded;
		},
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}

// function makeNodeUpdateCodec(
// 	childCodec: IJsonCodec<NodeChangeset>,
// ): IJsonCodec<NodeUpdate, EncodedNodeUpdate<TAnySchema>> {
// 	return {
// 		encode: (update: NodeUpdate) => {
// 			const encoded: EncodedNodeUpdate<TAnySchema> =
// 				"revert" in update
// 					? { revert: update.revert }
// 					: { set: update.set, buildId: update.buildId };

// 			// if (update.changes !== undefined) {
// 			// 	encoded.changes = childCodec.encode(update.changes);
// 			// }

// 			return encoded as JsonCompatibleReadOnly & EncodedNodeUpdate<TAnySchema>;
// 		},
// 		decode: (encoded: EncodedNodeUpdate<TAnySchema>) => {
// 			const decoded: NodeUpdate =
// 				"revert" in encoded
// 					? { revert: encoded.revert }
// 					: { set: encoded.set, buildId: encoded.buildId };

// 			// if (encoded.changes !== undefined) {
// 			// 	decoded.changes = childCodec.decode(encoded.changes);
// 			// }

// 			return decoded;
// 		},
// 		encodedSchema: EncodedNodeUpdate(childCodec.encodedSchema ?? Type.Any()),
// 	};
// }
