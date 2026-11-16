/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DiscriminatedUnionDispatcher,
	type IJsonCodec,
	type JsonCodecPart,
} from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
	RevisionTag,
	RevisionTagSchema,
} from "../../core/index.js";
import {
	EncodedNodeChangeset,
	type FieldChangeEncodingContext,
	type FieldChangeDecodingContext,
} from "../modular-schema/index.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV3.js";
import {
	decodeSequenceChangeset,
	encodeRevisionWithContext,
	encodeSequenceChangeset,
	makeV2CodecHelpers,
	tryGetEncodedCellRename,
} from "./sequenceFieldCodecV2.js";
import type { Changeset, Mark, MarkEffect, Rename } from "./types.js";

export function makeV3Codec(
	revisionTagCodec: JsonCodecPart<
		RevisionTag,
		typeof RevisionTagSchema,
		ChangeEncodingContext
	>,
): IJsonCodec<
	Changeset,
	Encoded.Changeset<typeof EncodedNodeChangeset>,
	Encoded.Changeset<typeof EncodedNodeChangeset>,
	FieldChangeEncodingContext,
	FieldChangeDecodingContext
> {
	const {
		changeAtomIdCodec: atomIdCodec,
		encodeMarkEffect: encodeV2MarkEffect,
		decoderLibrary: decoderLibraryV2,
	} = makeV2CodecHelpers(revisionTagCodec);

	function encodeMarkEffect(
		mark: Mark,
		context: FieldChangeEncodingContext,
	): Encoded.MarkEffect {
		const encoded = encodeV2MarkEffect(mark, context);
		const encodedRenameId = tryGetEncodedCellRename(encoded);
		if (encodedRenameId !== undefined) {
			return {
				rename: {
					idOverride: encodedRenameId,
				},
			};
		}

		return encoded;
	}

	function decodeMarkEffect(
		encoded: Encoded.MarkEffect,
		count: number,
		cellId: ChangeAtomId | undefined,
		context: FieldChangeDecodingContext,
	): MarkEffect {
		return decoderLibrary.dispatch(encoded, count, cellId, context);
	}

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeDecodingContext,
		],
		MarkEffect
	>({
		...decoderLibraryV2,
		rename(
			encoded: Encoded.Rename,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeDecodingContext,
		): Rename {
			return {
				type: "Rename",
				idOverride: atomIdCodec.decode(encoded.idOverride, context.baseContext),
			};
		},
	});

	type NodeChangeSchema = typeof EncodedNodeChangeset;

	return {
		encode: (
			changeset: Changeset,
			context: FieldChangeEncodingContext,
		): Encoded.Changeset<NodeChangeSchema> =>
			encodeSequenceChangeset(
				changeset,
				context,
				(revision) =>
					encodeRevisionWithContext(revision, context.baseContext, revisionTagCodec),
				atomIdCodec,
				encodeMarkEffect,
			),
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: FieldChangeDecodingContext,
		): Changeset => decodeSequenceChangeset(changeset, context, atomIdCodec, decodeMarkEffect),
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}
