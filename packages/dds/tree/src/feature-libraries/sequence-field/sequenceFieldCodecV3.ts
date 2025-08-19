/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TAnySchema } from "@sinclair/typebox";

import { DiscriminatedUnionDispatcher, type IJsonCodec } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV3.js";
import type { Changeset, Mark, MarkEffect, Rename } from "./types.js";
import { isNoopMark } from "./utils.js";
import type { FieldChangeEncodingContext } from "../index.js";
import { EncodedNodeChangeset } from "../modular-schema/index.js";
import { makeV2CodecHelpers } from "./sequenceFieldCodecV2.js";
import { assert } from "@fluidframework/core-utils/internal";

export function makeV3Codec(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<
	Changeset,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldChangeEncodingContext
> {
	const {
		changeAtomIdCodec: atomIdCodec,
		markEffectCodec: markEffectV2Codec,
		decoderLibrary: decoderLibraryV2,
	} = makeV2CodecHelpers(revisionTagCodec);

	const markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		FieldChangeEncodingContext
	> = {
		encode(effect: MarkEffect, context: FieldChangeEncodingContext): Encoded.MarkEffect {
			const type = effect.type;
			switch (type) {
				case "Rename":
					return {
						rename: {
							idOverride: atomIdCodec.encode(effect.idOverride, context.baseContext),
						},
					};
				default:
					return markEffectV2Codec.encode(effect, context);
			}
		},
		decode(encoded: Encoded.MarkEffect, context: FieldChangeEncodingContext): MarkEffect {
			return decoderLibrary.dispatch(encoded, context.baseContext);
		},
	};

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [context: ChangeEncodingContext],
		MarkEffect
	>({
		...decoderLibraryV2,
		rename(encoded: Encoded.Rename, context: ChangeEncodingContext): Rename {
			return {
				type: "Rename",
				idOverride: atomIdCodec.decode(encoded.idOverride, context),
			};
		},
	});

	/**
	 * If we want to make the node change aspect of this codec more type-safe, we could adjust generics
	 * to be in terms of the schema rather than the concrete type of the node change.
	 */
	type NodeChangeSchema = TAnySchema;

	return {
		encode: (
			changeset: Changeset,
			context: FieldChangeEncodingContext,
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> => {
			assert(
				context.rootNodeChanges.length === 0 && context.rootRenames.entries().length === 0,
				"XXX",
			);

			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				const encodedMark: Encoded.Mark<NodeChangeSchema> = {
					count: mark.count,
				};
				if (!isNoopMark(mark)) {
					encodedMark.effect = markEffectCodec.encode(mark, context);
				}
				if (mark.cellId !== undefined) {
					encodedMark.cellId = atomIdCodec.encode(mark.cellId, context.baseContext);
				}
				if (mark.changes !== undefined) {
					encodedMark.changes = context.encodeNode(mark.changes);
				}
				jsonMarks.push(encodedMark);
			}
			return jsonMarks;
		},
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: FieldChangeEncodingContext,
		): Changeset => {
			const marks: Changeset = [];
			for (const mark of changeset) {
				const decodedMark: Mark = {
					count: mark.count,
				};

				if (mark.effect !== undefined) {
					Object.assign(decodedMark, markEffectCodec.decode(mark.effect, context));
					assert(mark.effect.rename === undefined, "XXX");
					assert(mark.effect.attachAndDetach === undefined, "XXX");
				}
				if (mark.cellId !== undefined) {
					decodedMark.cellId = atomIdCodec.decode(mark.cellId, context.baseContext);
				}
				if (mark.changes !== undefined) {
					assert(mark.cellId === undefined, "XXX");
					decodedMark.changes = context.decodeNode(mark.changes);
				}

				marks.push(decodedMark);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}
