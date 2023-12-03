/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import { TAnySchema, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnly, Mutable, fail } from "../../util";
import { DiscriminatedUnionDispatcher, IJsonCodec, makeCodecFamily } from "../../codec";
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

export const sequenceFieldChangeCodecFactory = <TNodeChange>(childCodec: IJsonCodec<TNodeChange>) =>
	makeCodecFamily<Changeset<TNodeChange>>([[0, makeV0Codec(childCodec)]]);

function makeV0Codec<TNodeChange>(
	childCodec: IJsonCodec<TNodeChange>,
): IJsonCodec<Changeset<TNodeChange>> {
	const markEffectCodec: IJsonCodec<MarkEffect, Encoded.MarkEffect> = {
		encode(effect: MarkEffect): Encoded.MarkEffect {
			const type = effect.type;
			switch (type) {
				case "MoveIn":
					return {
						moveIn: {
							finalEndpoint: effect.finalEndpoint,
							id: effect.id,
						},
					};
				case "Insert":
					return { insert: { revision: effect.revision, id: effect.id } };
				case "Delete":
					return {
						delete: {
							revision: effect.revision,
							detachIdOverride: effect.detachIdOverride,
							id: effect.id,
						},
					};
				case "MoveOut":
					return {
						moveOut: {
							finalEndpoint: effect.finalEndpoint,
							detachIdOverride: effect.detachIdOverride,
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
				case "Placeholder":
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
			const { id, finalEndpoint } = encoded;
			const mark: MoveIn = {
				type: "MoveIn",
				id,
			};
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = finalEndpoint;
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
				mark.revision = revision;
			}
			return mark;
		},
		delete(encoded: Encoded.Delete): Delete {
			const { id, revision, detachIdOverride } = encoded;
			const mark: Delete = {
				type: "Delete",
				id,
			};
			if (revision !== undefined) {
				mark.revision = revision;
			}
			if (detachIdOverride !== undefined) {
				mark.detachIdOverride = detachIdOverride;
			}
			return mark;
		},
		moveOut(encoded: Encoded.MoveOut): MoveOut {
			const { id, finalEndpoint, detachIdOverride } = encoded;
			const mark: MoveOut = {
				type: "MoveOut",
				id,
			};
			if (finalEndpoint !== undefined) {
				mark.finalEndpoint = finalEndpoint;
			}
			if (detachIdOverride !== undefined) {
				mark.detachIdOverride = detachIdOverride;
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
					revision,
					id,
					count,
					offset,
				]),
				revision,
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
					revision,
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
