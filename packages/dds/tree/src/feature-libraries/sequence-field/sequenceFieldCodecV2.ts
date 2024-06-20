/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import { DiscriminatedUnionDispatcher, type IJsonCodec } from "../../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
} from "../../core/index.js";
import { type JsonCompatibleReadOnly, type Mutable, fail } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV2.js";
import {
	type Attach,
	type AttachAndDetach,
	type Changeset,
	type Detach,
	type Insert,
	type Mark,
	type MarkEffect,
	type MoveIn,
	type MoveOut,
	NoopMarkType,
	type Remove,
} from "./types.js";
import { isNoopMark } from "./utils.js";
import type { FieldChangeEncodingContext } from "../index.js";
import { EncodedNodeChangeset } from "../modular-schema/index.js";

export function makeV2Codec(
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
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	const markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		ChangeEncodingContext
	> = {
		encode(effect: MarkEffect, context: ChangeEncodingContext): Encoded.MarkEffect {
			function encodeRevision(
				revision: RevisionTag | undefined,
			): EncodedRevisionTag | undefined {
				if (revision === undefined || revision === context.revision) {
					return undefined;
				}

				return revisionTagCodec.encode(revision, context);
			}

			const type = effect.type;
			switch (type) {
				case "MoveIn":
					return {
						moveIn: {
							revision: encodeRevision(effect.revision),
							finalEndpoint:
								effect.finalEndpoint === undefined
									? undefined
									: changeAtomIdCodec.encode(effect.finalEndpoint, context),
							id: effect.id,
						},
					};
				case "Insert":
					return {
						insert: {
							revision: encodeRevision(effect.revision),
							id: effect.id,
						},
					};
				case "Remove":
					return {
						remove: {
							revision: encodeRevision(effect.revision),
							idOverride:
								effect.idOverride === undefined
									? undefined
									: changeAtomIdCodec.encode(effect.idOverride, context),
							id: effect.id,
						},
					};
				case "MoveOut":
					return {
						moveOut: {
							revision: encodeRevision(effect.revision),
							finalEndpoint:
								effect.finalEndpoint === undefined
									? undefined
									: changeAtomIdCodec.encode(effect.finalEndpoint, context),
							idOverride:
								effect.idOverride === undefined
									? undefined
									: changeAtomIdCodec.encode(effect.idOverride, context),
							id: effect.id,
						},
					};
				case "AttachAndDetach":
					return {
						attachAndDetach: {
							attach: markEffectCodec.encode(effect.attach, context) as Encoded.Attach,
							detach: markEffectCodec.encode(effect.detach, context) as Encoded.Detach,
						},
					};
				case NoopMarkType:
					fail(`Mark type: ${type} should not be encoded.`);
				default:
					unreachableCase(type);
			}
		},
		decode(encoded: Encoded.MarkEffect, context: ChangeEncodingContext): MarkEffect {
			return decoderLibrary.dispatch(encoded, context);
		},
	};

	function decodeRevision(
		encodedRevision: EncodedRevisionTag | undefined,
		context: ChangeEncodingContext,
	): RevisionTag {
		if (encodedRevision === undefined) {
			assert(context.revision !== undefined, 0x996 /* Implicit revision should be provided */);
			return context.revision;
		}

		return revisionTagCodec.decode(encodedRevision, context);
	}

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [context: ChangeEncodingContext],
		MarkEffect
	>({
		moveIn(encoded: Encoded.MoveIn, context: ChangeEncodingContext): MoveIn {
			const { id, finalEndpoint, revision } = encoded;
			const mark: MoveIn = {
				type: "MoveIn",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = changeAtomIdCodec.decode(finalEndpoint, context);
			}
			return mark;
		},
		insert(encoded: Encoded.Insert, context: ChangeEncodingContext): Insert {
			const { id, revision } = encoded;
			const mark: Insert = {
				type: "Insert",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			return mark;
		},
		remove(encoded: Encoded.Remove, context: ChangeEncodingContext): Remove {
			const { id, revision, idOverride } = encoded;
			const mark: Mutable<Remove> = {
				type: "Remove",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context);
			}
			return mark;
		},
		moveOut(encoded: Encoded.MoveOut, context: ChangeEncodingContext): MoveOut {
			const { id, finalEndpoint, idOverride, revision } = encoded;
			const mark: Mutable<MoveOut> = {
				type: "MoveOut",
				id,
			};

			mark.revision = decodeRevision(revision, context);
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = changeAtomIdCodec.decode(finalEndpoint, context);
			}
			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context);
			}

			return mark;
		},
		attachAndDetach(
			encoded: Encoded.AttachAndDetach,
			context: ChangeEncodingContext,
		): AttachAndDetach {
			return {
				type: "AttachAndDetach",
				attach: decoderLibrary.dispatch(encoded.attach, context) as Attach,
				detach: decoderLibrary.dispatch(encoded.detach, context) as Detach,
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
			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				const encodedMark: Encoded.Mark<NodeChangeSchema> = {
					count: mark.count,
				};
				if (!isNoopMark(mark)) {
					encodedMark.effect = markEffectCodec.encode(mark, context.baseContext);
				}
				if (mark.cellId !== undefined) {
					encodedMark.cellId = changeAtomIdCodec.encode(mark.cellId, context.baseContext);
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
					Object.assign(decodedMark, markEffectCodec.decode(mark.effect, context.baseContext));
				}
				if (mark.cellId !== undefined) {
					decodedMark.cellId = changeAtomIdCodec.decode(mark.cellId, context.baseContext);
				}
				if (mark.changes !== undefined) {
					decodedMark.changes = context.decodeNode(mark.changes);
				}
				marks.push(decodedMark);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}
