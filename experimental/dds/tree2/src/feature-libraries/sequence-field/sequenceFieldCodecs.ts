/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly, Mutable, fail } from "../../util";
import { DiscriminatedUnionDispatcher, IJsonCodec, makeCodecFamily } from "../../codec";
import { EncodedRevisionTag, RevisionTag } from "../../core";
import { decodeChangeAtomId, encodeChangeAtomId } from "../utils";
import {
	Attach,
	AttachAndDetach,
	CellId,
	Changeset,
	Delete,
	Detach,
	Insert,
	Mark,
	MarkEffect,
	MoveIn,
	MoveOut,
	NoopMarkType,
} from "./types";
import { Changeset as ChangesetSchema, Encoded } from "./format";
import { isNoopMark } from "./utils";

export const sequenceFieldChangeCodecFactory = <TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
) => makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec, revisionTagCodec)]]);
function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag>,
): IJsonCodec<Changeset<TNodeChange>> {
	const markEffectCodec: IJsonCodec<MarkEffect, Encoded.MarkEffect> = {
		encode(effect: MarkEffect): Encoded.MarkEffect {
			const type = effect.type;
			switch (type) {
				case "MoveIn":
					return {
						moveIn: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision),
							finalEndpoint:
								effect.finalEndpoint === undefined
									? undefined
									: encodeChangeAtomId(revisionTagCodec, effect.finalEndpoint),
							id: effect.id,
						},
					};
				case "Insert":
					return {
						insert: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision),
							id: effect.id,
						},
					};
				case "Delete":
					return {
						delete: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision),
							redetachId:
								effect.redetachId === undefined
									? undefined
									: cellIdCodec.encode(effect.redetachId),
							id: effect.id,
						},
					};
				case "MoveOut":
					return {
						moveOut: {
							revision:
								effect.revision === undefined
									? undefined
									: revisionTagCodec.encode(effect.revision),
							finalEndpoint:
								effect.finalEndpoint === undefined
									? undefined
									: encodeChangeAtomId(revisionTagCodec, effect.finalEndpoint),
							redetachId:
								effect.redetachId === undefined
									? undefined
									: cellIdCodec.encode(effect.redetachId),
							id: effect.id,
						},
					};
				case "AttachAndDetach":
					return {
						attachAndDetach: {
							attach: markEffectCodec.encode(effect.attach) as Encoded.Attach,
							detach: markEffectCodec.encode(effect.detach) as Encoded.Detach,
						},
					};
				case NoopMarkType:
					fail(`Mark type: ${type} should not be encoded.`);
				default:
					unreachableCase(type);
			}
		},
		decode(encoded: Encoded.MarkEffect): MarkEffect {
			return decoderLibrary.dispatch(encoded);
		},
	};

	const decoderLibrary = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [],
		MarkEffect
	>({
		moveIn(encoded: Encoded.MoveIn): MoveIn {
			const { id, finalEndpoint, revision } = encoded;
			const mark: MoveIn = {
				type: "MoveIn",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision);
			}
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = decodeChangeAtomId(revisionTagCodec, finalEndpoint);
			}
			return mark;
		},
		insert(encoded: Encoded.Insert): Insert {
			const { id, revision } = encoded;
			const mark: Insert = {
				type: "Insert",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision);
			}
			return mark;
		},
		delete(encoded: Encoded.Delete): Delete {
			const { id, revision, redetachId } = encoded;
			const mark: Delete = {
				type: "Delete",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision);
			}
			if (redetachId !== undefined) {
				mark.redetachId = cellIdCodec.decode(redetachId);
			}
			return mark;
		},
		moveOut(encoded: Encoded.MoveOut): MoveOut {
			const { id, finalEndpoint, redetachId, revision } = encoded;
			const mark: MoveOut = {
				type: "MoveOut",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revisionTagCodec.decode(revision);
			}
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = decodeChangeAtomId(revisionTagCodec, finalEndpoint);
			}
			if (redetachId !== undefined) {
				mark.redetachId = cellIdCodec.decode(redetachId);
			}
			return mark;
		},
		attachAndDetach(encoded: Encoded.AttachAndDetach): AttachAndDetach {
			return {
				type: "AttachAndDetach",
				attach: decoderLibrary.dispatch(encoded.attach) as Attach,
				detach: decoderLibrary.dispatch(encoded.detach) as Detach,
			};
		},
	});

	const cellIdCodec: IJsonCodec<CellId, Encoded.CellId> = {
		encode: ({ localId, adjacentCells, lineage, revision }: CellId): Encoded.CellId => {
			const encoded: Encoded.CellId = {
				localId,
				adjacentCells: adjacentCells?.map(({ id, count }) => [id, count]),
				// eslint-disable-next-line @typescript-eslint/no-shadow
				lineage: lineage?.map(({ revision, id, count, offset }) => [
					revisionTagCodec.encode(revision),
					id,
					count,
					offset,
				]),
				revision: revision === undefined ? revision : revisionTagCodec.encode(revision),
			};
			return encoded;
		},
		decode: ({ localId, adjacentCells, lineage, revision }: Encoded.CellId): CellId => {
			// Note: this isn't inlined on decode so that round-tripping changes compare as deep-equal works,
			// which is mostly just a convenience for tests. On encode, JSON.stringify() takes care of removing
			// explicit undefined properties.
			const decoded: Mutable<CellId> = {
				localId,
			};
			if (revision !== undefined) {
				decoded.revision = revisionTagCodec.decode(revision);
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
					revision: revisionTagCodec.decode(revision),
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
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> => {
			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				const encodedMark: Encoded.Mark<NodeChangeSchema> = {
					count: mark.count,
				};
				if (!isNoopMark(mark)) {
					encodedMark.effect = markEffectCodec.encode(mark);
				}
				if (mark.cellId !== undefined) {
					encodedMark.cellId = cellIdCodec.encode(mark.cellId);
				}
				if (mark.changes !== undefined) {
					encodedMark.changes = childCodec.encode(mark.changes);
				}
				jsonMarks.push(encodedMark);
			}
			return jsonMarks;
		},
		decode: (changeset: Encoded.Changeset<NodeChangeSchema>): Changeset<TNodeChange> => {
			const marks: Changeset<TNodeChange> = [];
			for (const mark of changeset) {
				const decodedMark: Mark<TNodeChange> = {
					count: mark.count,
				};

				if (mark.effect !== undefined) {
					Object.assign(decodedMark, markEffectCodec.decode(mark.effect));
				}
				if (mark.cellId !== undefined) {
					decodedMark.cellId = cellIdCodec.decode(mark.cellId);
				}
				if (mark.changes !== undefined) {
					decodedMark.changes = childCodec.decode(mark.changes);
				}
				marks.push(decodedMark);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(childCodec.encodedSchema ?? Type.Any()),
	};
}
