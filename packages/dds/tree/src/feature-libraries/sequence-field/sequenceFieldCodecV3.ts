/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TAnySchema } from "@sinclair/typebox";

import { DiscriminatedUnionDispatcher, type IJsonCodec } from "../../codec/index.js";
import type {
	ChangeAtomId,
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import {
	EncodedNodeChangeset,
	type FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV3.js";
import {
	decodeSequenceChangeset,
	encodeRevision,
	encodeSequenceChangeset,
	makeV2CodecHelpers,
} from "./sequenceFieldCodecV2.js";
import type { Changeset, Mark, MarkEffect, Rename } from "./types.js";

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
		encodeMarkEffect: encodeV2MarkEffect,
		decoderLibrary: decoderLibraryV2,
	} = makeV2CodecHelpers(revisionTagCodec);

	function encodeMarkEffect(
		mark: Mark,
		context: FieldChangeEncodingContext,
	): Encoded.MarkEffect {
		const type = mark.type;
		switch (type) {
			// XXX: Some renames should be encoded as attach and detach
			case "Rename":
				return {
					rename: {
						idOverride: atomIdCodec.encode(mark.idOverride, context.baseContext),
					},
				};
			default:
				return encodeV2MarkEffect(mark, context);
		}
	}

	function decodeMarkEffect(
		encoded: Encoded.MarkEffect,
		count: number,
		cellId: ChangeAtomId | undefined,
		context: FieldChangeEncodingContext,
	): MarkEffect {
		return decoderLibrary.dispatch(encoded, count, cellId, context);
	}

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		],
		MarkEffect
	>({
		...decoderLibraryV2,
		rename(
			encoded: Encoded.Rename,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Rename {
			// XXX: Handle root renames
			return {
				type: "Rename",
				idOverride: atomIdCodec.decode(encoded.idOverride, context.baseContext),
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
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> =>
			encodeSequenceChangeset(
				changeset,
				context,
				(revision) => encodeRevision(revision, context.baseContext, revisionTagCodec),
				atomIdCodec,
				encodeMarkEffect,
			),
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: FieldChangeEncodingContext,
		): Changeset => decodeSequenceChangeset(changeset, context, atomIdCodec, decodeMarkEffect),
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}
