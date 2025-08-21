/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
import type { TAnySchema } from "@sinclair/typebox";

import {
	DiscriminatedUnionDispatcher,
	type DiscriminatedUnionLibrary,
	type IJsonCodec,
} from "../../codec/index.js";
import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type ChangesetLocalId,
	type EncodedRevisionTag,
	type RevisionTag,
} from "../../core/index.js";
import { type JsonCompatibleReadOnly, type Mutable, brand } from "../../util/index.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV2.js";
import {
	type Attach,
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	NoopMarkType,
	type Rename,
} from "./types.js";
import {
	getAttachedNodeId,
	getDetachedNodeId,
	getMovedNodeId,
	isNoopMark,
	splitMark,
} from "./utils.js";
import type { FieldChangeEncodingContext } from "../index.js";
import { EncodedNodeChangeset, type EncodedChangeAtomId } from "../modular-schema/index.js";
import type { SequenceCodecHelpers } from "./helperTypes.js";
import { rangeQueryChangeAtomIdMap } from "../modular-schema/modularChangeFamily.js";
import { isMoveMark } from "./moveEffectTable.js";

export function makeV2CodecHelpers(
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): SequenceCodecHelpers {
	const changeAtomIdCodec = makeChangeAtomIdCodec(revisionTagCodec);

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

	const decoderLibrary = makeMarkEffectDecoder(changeAtomIdCodec, decodeRevision);

	const decoderDispatcher = new DiscriminatedUnionDispatcher<
		Encoded.MarkEffect,
		/* args */ [
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		],
		MarkEffect
	>(decoderLibrary);

	return {
		changeAtomIdCodec,
		decoderLibrary,

		encodeMarkEffect(mark: Mark, context: FieldChangeEncodingContext): Encoded.MarkEffect {
			throw new Error("Function not implemented.");
		},

		decodeRevision: (
			encoded: EncodedRevisionTag | undefined,
			context: ChangeEncodingContext,
		): RevisionTag =>
			encoded !== undefined
				? revisionTagCodec.decode(encoded, context)
				: (context.revision ?? fail("Expected a default revision")),

		decodeMarkEffect: (
			encoded: Encoded.MarkEffect,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): MarkEffect => {
			return decoderDispatcher.dispatch(encoded, count, cellId, context);
		},
	};
}

function makeMarkEffectDecoder(
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
	decodeRevision: (
		revision: EncodedRevisionTag | undefined,
		context: ChangeEncodingContext,
	) => RevisionTag,
): DiscriminatedUnionLibrary<
	Encoded.MarkEffect,
	/* args */ [
		count: number,
		cellId: ChangeAtomId | undefined,
		context: FieldChangeEncodingContext,
	],
	MarkEffect
> {
	const decoderLibrary: DiscriminatedUnionLibrary<
		Encoded.MarkEffect,
		/* args */ [
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		],
		MarkEffect
	> = {
		moveIn(
			encoded: Encoded.MoveIn,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Attach {
			const { id, revision } = encoded;
			const endpoint =
				encoded.finalEndpoint !== undefined
					? changeAtomIdCodec.decode(encoded.finalEndpoint, context.baseContext)
					: undefined;

			const mark: Attach = {
				type: "Insert",
				id: endpoint?.localId ?? id,
				revision: endpoint?.revision ?? decodeRevision(revision, context.baseContext),
			};

			return mark;
		},
		insert(
			encoded: Encoded.Insert,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Attach {
			const { id, revision } = encoded;
			const mark: Attach = {
				type: "Insert",
				id,
			};

			mark.revision = decodeRevision(revision, context.baseContext);
			return mark;
		},
		remove(
			encoded: Encoded.Remove,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Detach {
			const { id, revision, idOverride } = encoded;
			const mark: Mutable<Detach> = {
				type: "Remove",
				id,
			};

			mark.revision = decodeRevision(revision, context.baseContext);
			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context.baseContext);
			}
			return mark;
		},
		moveOut(
			encoded: Encoded.MoveOut,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Detach | Rename {
			const { id, idOverride, revision } = encoded;

			const mark: Mutable<Detach> = {
				type: "Remove",
				revision: decodeRevision(revision, context.baseContext),
				id,
			};

			if (idOverride !== undefined) {
				mark.idOverride = changeAtomIdCodec.decode(idOverride, context.baseContext);
			}

			if (cellId !== undefined) {
				context.decodeRootRename(cellId, getDetachedNodeId(mark), count);
				return {
					type: "Rename",
					idOverride: mark.idOverride ?? fail("Expected an ID override"),
				};
			}

			return mark;
		},
		attachAndDetach(
			encoded: Encoded.AttachAndDetach,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Rename {
			// In documents generated by clients on release >=2.2 (i.e., running the code from the PR that added this comment),
			// renames are encoded as AttachAndDetach with a special id.
			// This ensures forward-compatibility of clients on release <=2.1 with documents/ops generated by clients on release >=2.2.
			if (encoded.attach.insert !== undefined && encoded.attach.insert.id === renameLocalId) {
				assert(
					encoded.detach.remove?.idOverride !== undefined,
					0x9f8 /* Rename must have idOverride */,
				);
				return {
					type: "Rename",
					idOverride: changeAtomIdCodec.decode(
						encoded.detach.remove.idOverride,
						context.baseContext,
					),
				};
			}

			assert(
				encoded.detach.remove !== undefined,
				"Attach and detach should always contains a remove",
			);

			const detachId: ChangeAtomId =
				encoded.detach.remove.idOverride !== undefined
					? changeAtomIdCodec.decode(encoded.detach.remove.idOverride, context.baseContext)
					: {
							revision: decodeRevision(encoded.detach.remove.revision, context.baseContext),
							localId: encoded.detach.remove.id,
						};

			return {
				type: "Rename",
				idOverride: detachId,
			};
		},
	};

	return decoderLibrary;
}

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
	const { decodeMarkEffect, changeAtomIdCodec } = makeV2CodecHelpers(revisionTagCodec);
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
			function encodeRevision(
				revision: RevisionTag | undefined,
			): EncodedRevisionTag | undefined {
				if (revision === undefined || revision === context.baseContext.revision) {
					return undefined;
				}

				return revisionTagCodec.encode(revision, context.baseContext);
			}

			const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
			for (const mark of changeset) {
				jsonMarks.push(...encodeMark(mark, context, encodeRevision, changeAtomIdCodec));
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

				if (mark.cellId !== undefined) {
					decodedMark.cellId = changeAtomIdCodec.decode(mark.cellId, context.baseContext);
				}

				if (mark.effect !== undefined) {
					Object.assign(
						decodedMark,
						decodeMarkEffect(mark.effect, mark.count, decodedMark.cellId, context),
					);
				}

				if (mark.changes !== undefined) {
					assert(mark.cellId === undefined, "XXX");
					decodedMark.changes = context.decodeNode(mark.changes);
				}

				marks.push(decodedMark);
				reportRootChangesForMark(mark, decodedMark, context);
			}
			return marks;
		},
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}

function encodeMark(
	mark: Mark,
	context: FieldChangeEncodingContext,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): Encoded.Mark<TAnySchema>[] {
	const splitLength = getLengthToSplitMark(mark, context);
	if (splitLength < mark.count) {
		const [mark1, mark2] = splitMark(mark, splitLength);
		return [
			encodeSplitMark(mark1, context, encodeRevision, changeAtomIdCodec),
			...encodeMark(mark2, context, encodeRevision, changeAtomIdCodec),
		];
	}

	return [encodeSplitMark(mark, context, encodeRevision, changeAtomIdCodec)];
}

function encodeRename(
	mark: CellMark<Rename>,
	context: FieldChangeEncodingContext,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
): Encoded.MarkEffect {
	assert(mark.cellId !== undefined, "Rename should target empty cell");
	const renamedNodeId = context.rootRenames.getFirst(mark.cellId, mark.count).value;
	if (renamedNodeId !== undefined && !areEqualChangeAtomIds(renamedNodeId, mark.idOverride)) {
		// Detached nodes which were last at this cell location have been moved.
		return {
			moveOut: {
				revision: encodeRevision(renamedNodeId.revision),
				id: renamedNodeId.localId,
				idOverride: changeAtomIdCodec.encode(mark.idOverride, context.baseContext),
			},
		};
	}

	if (context.isDetachId(mark.idOverride, 1).value) {
		// These cells are the final detach location of moved nodes.
		const encodedRevision = encodeRevision(mark.idOverride.revision);

		return {
			attachAndDetach: {
				attach: {
					moveIn: {
						revision: encodedRevision,
						id: mark.idOverride.localId,
					},
				},
				detach: {
					remove: {
						revision: encodedRevision,
						id: mark.idOverride.localId,
					},
				},
			},
		};
	}

	// In documents generated by clients on release >=2.2 (i.e., running the code from the PR that added this comment),
	// renames are encoded as AttachAndDetach with a special id.
	// This ensures forward-compatibility of clients on release <=2.1 with documents/ops generated by clients on release >=2.2.
	return {
		attachAndDetach: {
			attach: { insert: { id: renameLocalId } },
			detach: {
				remove: {
					id: renameLocalId,
					idOverride: changeAtomIdCodec.encode(mark.idOverride, context.baseContext),
				},
			},
		},
	};
}

function getLengthToSplitMark(mark: Mark, context: FieldChangeEncodingContext): number {
	// XXX: Split for renames and `isDetachId`.
	const length1 =
		mark.cellId !== undefined
			? rangeQueryChangeAtomIdMap(context.rootNodeChanges, mark.cellId, mark.count).length
			: mark.count;

	return isMoveMark(mark)
		? context.isMoveId(getMovedNodeId(mark), mark.count).length
		: length1;
}

function encodeSplitMark(
	mark: Mark,
	context: FieldChangeEncodingContext,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): Encoded.Mark<TAnySchema> {
	const encodedMark: Encoded.Mark<TAnySchema> = {
		count: mark.count,
	};
	if (!isNoopMark(mark)) {
		encodedMark.effect = encodeMarkEffect(mark, context, encodeRevision, changeAtomIdCodec);
	}
	if (mark.cellId !== undefined) {
		encodedMark.cellId = changeAtomIdCodec.encode(mark.cellId, context.baseContext);
	}
	if (mark.changes !== undefined) {
		encodedMark.changes = context.encodeNode(mark.changes);
	}

	return encodedMark;
}

function encodeMarkEffect(
	mark: Mark,
	context: FieldChangeEncodingContext,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
): Encoded.MarkEffect {
	const type = mark.type;
	switch (type) {
		case "Insert":
			return context.isMoveId(getAttachedNodeId(mark), 1).value
				? {
						moveIn: { revision: encodeRevision(mark.revision), id: mark.id },
					}
				: {
						insert: {
							revision: encodeRevision(mark.revision),
							id: mark.id,
						},
					};
		case "Remove": {
			const encodedIdOverride =
				mark.idOverride === undefined
					? undefined
					: changeAtomIdCodec.encode(mark.idOverride, context.baseContext);

			// Having an idOverride means that this is not the final detach location, and should be encoded as a move.
			return context.isMoveId(getDetachedNodeId(mark), 1).value ||
				!areEqualChangeAtomIdOpts(mark.idOverride, {
					revision: mark.revision,
					localId: mark.id,
				})
				? {
						moveOut: {
							revision: encodeRevision(mark.revision),
							id: mark.id,
							idOverride: encodedIdOverride,
						},
					}
				: {
						remove: {
							revision: encodeRevision(mark.revision),
							idOverride: encodedIdOverride,
							id: mark.id,
						},
					};
		}
		case "Rename":
			return encodeRename(mark, context, changeAtomIdCodec, encodeRevision);
		case NoopMarkType:
			fail(0xb2c /* Mark type: NoopMarkType should not be encoded. */);
		default:
			unreachableCase(type);
	}
}

function reportRootChangesForMark(
	encodedMark: Encoded.Mark<TAnySchema>,
	mark: Mark,
	context: FieldChangeEncodingContext,
): void {
	if (mark.cellId !== undefined && mark.changes !== undefined) {
		context.decodeRootNodeChange(mark.cellId, mark.changes);
	}

	// Note that if the mark was encoded as a move-in, we do not report a rename.
	if (encodedMark.effect?.insert !== undefined) {
		assert(mark.type === "Insert", "Expected mark to have decoded to an insert.");
		const attachId = getAttachedNodeId(mark);
		if (mark.cellId !== undefined && !areEqualChangeAtomIds(mark.cellId, attachId)) {
			context.decodeRootRename(mark.cellId, attachId, mark.count);
		}
	} else if (encodedMark.effect?.attachAndDetach !== undefined) {
		assert(mark.cellId !== undefined, "Attach and detach should target an empty cell");
		assert(mark.type === "Rename", "Expected attach and detach to decode to a rename");
		const isNodeMove = encodedMark.effect.attachAndDetach.attach.moveIn !== undefined;
		if (
			!isNodeMove &&
			encodedMark.effect.attachAndDetach.detach.remove?.id !== renameLocalId
		) {
			context.decodeRootRename(mark.cellId, mark.idOverride, mark.count);
		}
	}
}

/**
 * Arbitrary ID that is used to indicate a Rename effect.
 */
const renameLocalId: ChangesetLocalId = brand(-1);
