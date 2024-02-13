/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly, Mutable, fail } from "../../util/index.js";
import { DiscriminatedUnionDispatcher, IJsonCodec, makeCodecFamily } from "../../codec/index.js";
import { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../../core/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import {
	Attach,
	AttachAndDetach,
	CellId,
	Changeset,
	Remove,
	Detach,
	Insert,
	Mark,
	MarkEffect,
	MoveIn,
	MoveOut,
	NoopMarkType,
} from "./types.js";
import { Changeset as ChangesetSchema, Encoded } from "./format.js";
import { isNoopMark } from "./utils.js";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(
	childCodec: IJsonCodec<
		TNodeChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
) =>
	makeCodecFamily<Changeset<TNodeChange>, ChangeEncodingContext>([
		[0, makeV0Codec(childCodec, revisionTagCodec)],
	]);
function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<
		TNodeChange,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): IJsonCodec<
	Changeset<TNodeChange>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
> {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);
	const markEffectCodec: IJsonCodec<
		MarkEffect,
		Encoded.MarkEffect,
		Encoded.MarkEffect,
		ChangeEncodingContext
	> = {
		encode(effect: MarkEffect, context: ChangeEncodingContext): Encoded.MarkEffect {
			const type = effect.type;
			switch (type) {
				case "MoveIn":
					return {
						moveIn: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision, context),
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
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision, context),
							id: effect.id,
						},
					};
				case "Remove":
					return {
						delete: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision, context),
							idOverride:
								effect.idOverride === undefined
									? undefined
									: {
											type: effect.idOverride.type,
											id: cellIdCodec.encode(effect.idOverride.id, context),
									  },
							id: effect.id,
						},
					};
				case "MoveOut":
					return {
						moveOut: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision, context),
							finalEndpoint:
								effect.finalEndpoint === undefined
									? undefined
									: changeAtomIdCodec.encode(effect.finalEndpoint, context),
							idOverride:
								effect.idOverride === undefined
									? undefined
									: {
											type: effect.idOverride.type,
											id: cellIdCodec.encode(effect.idOverride.id, context),
									  },
							id: effect.id,
						},
					};
				case "AttachAndDetach":
					return {
						attachAndDetach: {
							attach: markEffectCodec.encode(
								effect.attach,
								context,
							) as Encoded.Attach,
							detach: markEffectCodec.encode(
								effect.detach,
								context,
							) as Encoded.Detach,
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
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision, context);
			}
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
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision, context);
			}
			return mark;
		},
		delete(encoded: Encoded.Remove, context: ChangeEncodingContext): Remove {
			const { id, revision, idOverride } = encoded;
			const mark: Mutable<Remove> = {
				type: "Remove",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision, context);
			}
			if (idOverride !== undefined) {
				mark.idOverride = {
					type: idOverride.type,
					id: cellIdCodec.decode(idOverride.id, context),
				};
			}
			return mark;
		},
		moveOut(encoded: Encoded.MoveOut, context: ChangeEncodingContext): MoveOut {
			const { id, finalEndpoint, idOverride, revision } = encoded;
			const mark: Mutable<MoveOut> = {
				type: "MoveOut",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision, context);
			}
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = changeAtomIdCodec.decode(finalEndpoint, context);
			}
			if (idOverride !== undefined) {
				mark.idOverride = {
					type: idOverride.type,
					id: cellIdCodec.decode(idOverride.id, context),
				};
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

	const cellIdCodec: IJsonCodec<CellId, Encoded.CellId, Encoded.CellId, ChangeEncodingContext> = {
		encode: (
			{ localId, adjacentCells, lineage, revision }: CellId,
			context: ChangeEncodingContext,
		): Encoded.CellId => {
			const encoded: Encoded.CellId = {
				atom: changeAtomIdCodec.encode({ localId, revision }, context),
				adjacentCells: adjacentCells?.map(({ id, count }) => [id, count]),
				// eslint-disable-next-line @typescript-eslint/no-shadow
				lineage: lineage?.map(({ revision, id, count, offset }) => [
					revisionTagCodec.encode(revision, context),
					id,
					count,
					offset,
				]),
			};
			return encoded;
		},
		decode: (
			{ atom, adjacentCells, lineage }: Encoded.CellId,
			context: ChangeEncodingContext,
		): CellId => {
			const { localId, revision } = changeAtomIdCodec.decode(atom, context);
			// Note: this isn't inlined on decode so that round-tripping changes compare as deep-equal works,
			// which is mostly just a convenience for tests. On encode, JSON.stringify() takes care of removing
			// explicit undefined properties.
			const decoded: Mutable<CellId> = { localId };
			if (revision !== undefined) {
				decoded.revision = revision;
			}
			if (adjacentCells !== undefined) {
				decoded.adjacentCells = adjacentCells.map(([id, count]) => ({
					id,
					count,
				}));
			}
			if (lineage !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-shadow
				decoded.lineage = lineage.map(([revision, id, count, offset]) => ({
					revision: revisionTagCodec.decode(revision, context),
					id,
					count,
					offset,
				}));
			}
			return decoded;
		},
	};

	/**
	 * If we want to make the node change aspect of this codec more type-safe, we could adjust generics
	 * to be in terms of the schema rather than the concrete type of the node change.
	 */
	type NodeChangeSchema = TAnySchema;

	return {
		encode: (
			changeset: Changeset<TNodeChange>,
			context: ChangeEncodingContext,
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> => {
			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				const encodedMark: Encoded.Mark<NodeChangeSchema> = {
					count: mark.count,
				};
				if (!isNoopMark(mark)) {
					encodedMark.effect = markEffectCodec.encode(mark, context);
				}
				if (mark.cellId !== undefined) {
					encodedMark.cellId = cellIdCodec.encode(mark.cellId, context);
				}
				if (mark.changes !== undefined) {
					encodedMark.changes = childCodec.encode(mark.changes, context);
				}
				jsonMarks.push(encodedMark);
			}
			return jsonMarks;
		},
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: ChangeEncodingContext,
		): Changeset<TNodeChange> => {
			const marks: Changeset<TNodeChange> = [];
			for (const mark of changeset) {
				const decodedMark: Mark<TNodeChange> = {
					count: mark.count,
				};

				if (mark.effect !== undefined) {
					Object.assign(decodedMark, markEffectCodec.decode(mark.effect, context));
				}
				if (mark.cellId !== undefined) {
					decodedMark.cellId = cellIdCodec.decode(mark.cellId, context);
				}
				if (mark.changes !== undefined) {
					decodedMark.changes = childCodec.decode(mark.changes, context);
				}
				marks.push(decodedMark);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(childCodec.encodedSchema ?? Type.Any()),
	};
}
