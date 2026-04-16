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
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type ChangeEncodingContext,
	type ChangesetLocalId,
	type EncodedRevisionTag,
	type RevisionTag,
} from "../../core/index.js";
import { type JsonCompatibleReadOnly, type Mutable, brand } from "../../util/index.js";
import { getFromChangeAtomIdMap, rangeQueryChangeAtomIdMap } from "../changeAtomIdBTree.js";
import { makeChangeAtomIdCodec } from "../changeAtomIdCodec.js";
import {
	EncodedNodeChangeset,
	type EncodedChangeAtomId,
	type FieldChangeEncodingContext,
} from "../modular-schema/index.js";

import { Changeset as ChangesetSchema, type Encoded } from "./formatV2.js";
import type { SequenceCodecHelpers } from "./helperTypes.js";
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
	getAttachedRootId,
	getDetachedRootId,
	getDetachOutputCellId,
	isNoopMark,
	splitMark,
} from "./utils.js";

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
			return encodeMarkEffectV2(
				mark,
				context,
				(revision) =>
					encodeRevisionWithContext(revision, context.baseContext, revisionTagCodec),
				changeAtomIdCodec,
			);
		},

		decodeRevision: (
			encoded: EncodedRevisionTag | undefined,
			context: ChangeEncodingContext,
		): RevisionTag =>
			encoded === undefined
				? (context.revision ?? fail("Expected a default revision"))
				: revisionTagCodec.decode(encoded, context),

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

export type DecodeMarkEffect = (
	encoded: Encoded.MarkEffect,
	count: number,
	cellId: ChangeAtomId | undefined,
	context: FieldChangeEncodingContext,
) => MarkEffect;

export function decodeSequenceChangeset(
	changeset: Encoded.Changeset<NodeChangeSchema>,
	context: FieldChangeEncodingContext,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
	decodeMarkEffect: DecodeMarkEffect,
): Changeset {
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
			if (decodedMark.cellId === undefined) {
				decodedMark.changes = context.decodeNode(mark.changes);
			} else {
				context.decodeRootNodeChange(decodedMark.cellId, mark.changes);
			}
		}

		marks.push(decodedMark);
	}
	return marks;
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
	function decodeMoveIn(encoded: Encoded.MoveIn, context: FieldChangeEncodingContext): Attach {
		const { id, revision } = encoded;
		const mark: Attach = {
			type: "Attach",
			id,
			revision: decodeRevision(revision, context.baseContext),
		};

		return mark;
	}

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
			return decodeMoveIn(encoded, context);
		},
		insert(
			encoded: Encoded.Insert,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Attach {
			const { id, revision } = encoded;
			const mark: Attach = {
				type: "Attach",
				id,
			};

			mark.revision = decodeRevision(revision, context.baseContext);

			const attachId = getAttachedRootId(mark);
			if (cellId !== undefined && !areEqualChangeAtomIds(cellId, attachId)) {
				context.decodeRootRename(cellId, attachId, count, false);
			}

			return mark;
		},
		remove(
			encoded: Encoded.Remove,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Detach | Rename {
			const { id, revision, idOverride } = encoded;

			const cellRename =
				idOverride === undefined
					? undefined
					: changeAtomIdCodec.decode(idOverride, context.baseContext);

			return decodeDetach(
				cellId,
				count,
				decodeRevision(revision, context.baseContext),
				id,
				cellRename,
				undefined,
				context,
			);
		},
		moveOut(
			encoded: Encoded.MoveOut,
			count: number,
			cellId: ChangeAtomId | undefined,
			context: FieldChangeEncodingContext,
		): Detach | Rename {
			const { id, idOverride, revision, finalEndpoint } = encoded;
			const cellRename =
				idOverride === undefined
					? undefined
					: changeAtomIdCodec.decode(idOverride, context.baseContext);

			const decodedRevision = decodeRevision(revision, context.baseContext);
			const decodedEndpoint =
				finalEndpoint === undefined
					? undefined
					: changeAtomIdCodec.decode(finalEndpoint, context.baseContext);

			return decodeDetach(
				cellId,
				count,
				decodedRevision,
				id,
				cellRename,
				decodedEndpoint,
				context,
			);
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
			const encodedRenameId = tryGetEncodedCellRenameFromAttachAndDetach(encoded);
			if (encodedRenameId !== undefined) {
				return {
					type: "Rename",
					idOverride: changeAtomIdCodec.decode(encodedRenameId, context.baseContext),
				};
			}

			assert(
				encoded.detach.remove !== undefined,
				"Attach and detach should always contains a remove",
			);

			const detachId: ChangeAtomId =
				encoded.detach.remove.idOverride === undefined
					? {
							revision: decodeRevision(encoded.detach.remove.revision, context.baseContext),
							localId: encoded.detach.remove.id,
						}
					: changeAtomIdCodec.decode(encoded.detach.remove.idOverride, context.baseContext);

			assert(cellId !== undefined, "Attach and detach should target an empty cell");
			if (encoded.attach.moveIn === undefined) {
				context.decodeRootRename(cellId, detachId, count, false);
			} else {
				context.decodeMoveAndDetach(detachId, count);
			}

			return {
				type: "Rename",
				idOverride: detachId,
			};
		},
	};

	return decoderLibrary;
}

function decodeDetach(
	cellId: ChangeAtomId | undefined,
	count: number,
	revision: RevisionTag,
	localId: ChangesetLocalId,
	cellRename: ChangeAtomId | undefined,
	endpoint: ChangeAtomId | undefined,
	context: FieldChangeEncodingContext,
): Detach | Rename {
	const detachId: ChangeAtomId = { revision, localId };
	if (cellId !== undefined) {
		context.decodeRootRename(cellId, endpoint ?? detachId, count, false);
		return {
			type: "Rename",
			idOverride: cellRename ?? detachId,
		};
	} else if (endpoint !== undefined) {
		context.decodeRootRename(detachId, endpoint, count, true);
	}

	const mark: Mutable<Detach> = {
		type: "Detach",
		revision,
		id: localId,
	};

	if (cellRename !== undefined) {
		mark.cellRename = cellRename;
	}

	return mark;
}

/**
 * If we want to make the node change aspect of this codec more type-safe, we could adjust generics
 * to be in terms of the schema rather than the concrete type of the node change.
 */
type NodeChangeSchema = TAnySchema;

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

	return {
		encode: (
			changeset: Changeset,
			context: FieldChangeEncodingContext,
		): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> =>
			encodeSequenceChangeset(
				changeset,
				context,
				(revision) =>
					encodeRevisionWithContext(revision, context.baseContext, revisionTagCodec),
				changeAtomIdCodec,
				encodeMarkEffectV2,
			),
		decode: (
			changeset: Encoded.Changeset<NodeChangeSchema>,
			context: FieldChangeEncodingContext,
		): Changeset =>
			decodeSequenceChangeset(changeset, context, changeAtomIdCodec, decodeMarkEffect),
		encodedSchema: ChangesetSchema(EncodedNodeChangeset),
	};
}

export function encodeSequenceChangeset(
	changeset: Changeset,
	context: FieldChangeEncodingContext,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
	encodeMarkEffect: EncodeMarkEffect,
): JsonCompatibleReadOnly & Encoded.Changeset<NodeChangeSchema> {
	const jsonMarks: Encoded.Changeset<NodeChangeSchema> = [];
	for (const mark of changeset) {
		jsonMarks.push(
			...encodeMark(mark, context, encodeRevision, changeAtomIdCodec, encodeMarkEffect),
		);
	}
	return jsonMarks;
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
	encodeMarkEffect: EncodeMarkEffect,
): Encoded.Mark<TAnySchema>[] {
	const splitLength = getLengthToSplitMark(mark, context);
	if (splitLength < mark.count) {
		const [mark1, mark2] = splitMark(mark, splitLength);
		return [
			encodeSplitMark(mark1, context, encodeRevision, changeAtomIdCodec, encodeMarkEffect),
			...encodeMark(mark2, context, encodeRevision, changeAtomIdCodec, encodeMarkEffect),
		];
	}

	return [encodeSplitMark(mark, context, encodeRevision, changeAtomIdCodec, encodeMarkEffect)];
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

	const inputRootId = context.getInputRootId(mark.idOverride, mark.count).value;

	// XXX: Refactor and comment
	const isMoveInAndDetach =
		!context.isAttachId(mark.idOverride, mark.count).value &&
		(context.isDetachId(mark.idOverride, mark.count).value ||
			(inputRootId !== undefined && !areEqualChangeAtomIds(inputRootId, mark.cellId)));

	if (isMoveInAndDetach) {
		// These cells are the final detach location of moved nodes.
		const encodedRevision = encodeRevision(mark.idOverride.revision);

		// XXX: Splitting
		const endpoint =
			inputRootId === undefined
				? undefined
				: context.isDetachId(inputRootId, mark.count).value
					? inputRootId
					: (context.getFirstRenameId(inputRootId, mark.count).value ?? inputRootId);

		const encodedEndpoint =
			endpoint === undefined
				? undefined
				: changeAtomIdCodec.encode(endpoint, context.baseContext);

		return {
			attachAndDetach: {
				attach: {
					moveIn: {
						revision: encodedRevision,
						id: mark.idOverride.localId,
						finalEndpoint: encodedEndpoint,
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

	const renamedRootId = context.rootRenames.getFirst(mark.cellId, mark.count).value;
	const isMoveOutAndAttach =
		renamedRootId !== undefined && context.isAttachId(renamedRootId, mark.count).value;

	const isRenameOfRoot = renamedRootId !== undefined;

	// If we are renaming a root, but the output ID is not `mark.idOverride`,
	// then we must be moving the node to another cell.
	// If it were left in this cell, the root's output ID would not match the cell's output ID.
	const isMoveOutAndDetach =
		isRenameOfRoot && !areEqualChangeAtomIds(renamedRootId, mark.idOverride);

	if (isMoveOutAndAttach || isMoveOutAndDetach) {
		// This mark represents a move of a node which was detached from this cell.
		// The root will be either be reattached with `moveId`,
		// or left detached in another cell, with `moveId` as its output root ID.
		// In the latter case, the other endpoint will be encoded as
		// attach and detach (move-in and remove), where both the move-in and the remove
		// use `moveId` as their ID.
		// In either of these cases, we need this mark's `finalEndpoint` to be `moveId`.
		// We can omit the final endpoint if it is the same as the move-out ID.
		const encodedEndpoint = areEqualChangeAtomIds(mark.idOverride, renamedRootId)
			? undefined
			: changeAtomIdCodec.encode(renamedRootId, context.baseContext);

		return {
			moveOut: {
				revision: encodeRevision(mark.idOverride.revision),
				id: mark.idOverride.localId,
				finalEndpoint: encodedEndpoint,
			},
		};
	}

	if (renamedRootId !== undefined) {
		return {
			remove: {
				revision: encodeRevision(renamedRootId.revision),
				id: renamedRootId.localId,
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
	let count: number =
		mark.cellId === undefined
			? mark.count
			: rangeQueryChangeAtomIdMap(context.rootNodeChanges, mark.cellId, mark.count).length;

	if (mark.cellId !== undefined) {
		count = context.getInputRootId(mark.cellId, count).length;
	}

	switch (mark.type) {
		case "Attach": {
			const attachId = getAttachedRootId(mark);
			count = context.isDetachId(attachId, count).length;
			count = context.getInputRootId(attachId, count).length;
			count = context.getFirstRenameId(attachId, count).length;
			break;
		}
		case "Detach": {
			const detachId = getDetachedRootId(mark);
			count = context.isAttachId(detachId, count).length;
			count = context.getOutputRootId(detachId, count).length;
			break;
		}
		case "Rename": {
			count = context.getInputRootId(mark.idOverride, count).length;
			count = context.isAttachId(mark.idOverride, count).length;
			count = context.isDetachId(mark.idOverride, count).length;
			const cellId = mark.cellId ?? fail("Rename should have cell ID");
			const renameEntry = context.rootRenames.getFirst(cellId, count);
			count = renameEntry.length;
			count = context.isAttachId(renameEntry.value ?? cellId, count).length;
			break;
		}
		default: {
			break;
		}
	}

	return count;
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
	encodeMarkEffect: EncodeMarkEffect,
): Encoded.Mark<TAnySchema> {
	const encodedMark: Encoded.Mark<TAnySchema> = {
		count: mark.count,
	};
	if (!isNoopMark(mark)) {
		encodedMark.effect = encodeMarkEffect(mark, context, encodeRevision, changeAtomIdCodec);
	}
	if (mark.cellId !== undefined) {
		assert(mark.changes === undefined, "Empty cells should not have node changes");
		encodedMark.cellId = changeAtomIdCodec.encode(mark.cellId, context.baseContext);
		const nodeId = getFromChangeAtomIdMap(context.rootNodeChanges, mark.cellId);
		if (nodeId !== undefined) {
			encodedMark.changes = context.encodeNode(nodeId);
		}
	} else if (mark.changes !== undefined) {
		encodedMark.changes = context.encodeNode(mark.changes);
	}

	return encodedMark;
}

type EncodeMarkEffect = (
	mark: Mark,
	context: FieldChangeEncodingContext,
	encodeRevision: (revision: RevisionTag | undefined) => EncodedRevisionTag | undefined,
	changeAtomIdCodec: IJsonCodec<
		ChangeAtomId,
		EncodedChangeAtomId,
		EncodedChangeAtomId,
		ChangeEncodingContext
	>,
) => Encoded.MarkEffect;

function encodeMarkEffectV2(
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
		case "Attach": {
			const attachId = getAttachedRootId(mark);
			const rootInputId = context.getInputRootId(attachId, mark.count).value ?? attachId;
			const isMove = context.isDetachId(rootInputId, mark.count).value;

			// XXX: Can we just call this `isMoveIn`? It seems like this check is sufficient.
			// If the input context ID for these nodes is not the cell ID,
			// then these nodes are being moved from the location at which they were last detached.
			const isInitialAttachLocation =
				mark.cellId === undefined || areEqualChangeAtomIds(mark.cellId, rootInputId);

			if (!isMove && isInitialAttachLocation) {
				// Note that in the case that the mark is a pin with different attach and detach IDs,
				// we encode it as a pin using just the detach ID.
				// This is because it is not possible to represent both IDs in this format,
				// and the attach ID is arbitrary and has no observable effect.
				//
				// The detach ID is observable, as if this change is rebased over a move of these nodes,
				// the resulting change will have a detach using that ID,
				// and other changes may reference the cell ID of that detach.
				const rootId = mark.detachId ?? attachId;
				return {
					insert: {
						revision: encodeRevision(rootId.revision),
						id: rootId.localId,
					},
				};
			}

			const detachId = isMove
				? rootInputId
				: (context.getFirstRenameId(rootInputId, mark.count).value ?? attachId);

			const encodedEndpoint = areEqualChangeAtomIds(detachId, attachId)
				? undefined
				: changeAtomIdCodec.encode(detachId, context.baseContext);

			return {
				moveIn: {
					revision: encodeRevision(mark.revision),
					id: mark.id,
					finalEndpoint: encodedEndpoint,
				},
			};
		}
		case "Detach": {
			const encodedIdOverride =
				mark.cellRename === undefined
					? undefined
					: changeAtomIdCodec.encode(mark.cellRename, context.baseContext);

			const detachId = getDetachedRootId(mark);
			const attachId = context.getOutputRootId(detachId, mark.count).value ?? detachId;
			const isMove = context.isAttachId(attachId, 1).value;

			const outputCellId = getDetachOutputCellId(mark);

			// If the final detach location for the nodes were here,
			// then the output cell ID would be the same as the detach ID.
			// So if the cell ID is different from the detach ID, the nodes must have been moved.
			const isFinalDetachLocation = areEqualChangeAtomIds(attachId, outputCellId);

			const isMoveOrDetachedMove = isMove || !isFinalDetachLocation;

			const encodedRevision = encodeRevision(mark.revision);
			if (isMoveOrDetachedMove) {
				const encodedEndpoint = areEqualChangeAtomIds(attachId, detachId)
					? undefined
					: changeAtomIdCodec.encode(attachId, context.baseContext);

				const encoded: Encoded.MarkEffect = {
					moveOut: {
						revision: encodedRevision,
						id: mark.id,
						idOverride: encodedIdOverride,
						finalEndpoint: encodedEndpoint,
					},
				};

				return encoded;
			}

			return {
				remove: {
					revision: encodedRevision,
					idOverride: encodedIdOverride,
					id: mark.id,
				},
			};
		}
		case "Rename": {
			return encodeRename(mark, context, changeAtomIdCodec, encodeRevision);
		}
		case NoopMarkType: {
			fail(0xb2c /* Mark type: NoopMarkType should not be encoded. */);
		}
		default: {
			unreachableCase(type);
		}
	}
}

export function encodeRevisionWithContext(
	revision: RevisionTag | undefined,
	context: ChangeEncodingContext,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
): EncodedRevisionTag | undefined {
	return revision === undefined || revision === context.revision
		? undefined
		: revisionTagCodec.encode(revision, context);
}

/**
 * Arbitrary ID that is used to indicate a Rename effect.
 */
const renameLocalId: ChangesetLocalId = brand(-1);

/**
 * If the encoded mark effect represents a simple cell rename (with no effect on root nodes),
 * returns the encoded form of the ID the cell is being renamed to,
 * and otherwise returns undefined.
 */
export function tryGetEncodedCellRename(
	encoded: Encoded.MarkEffect,
): EncodedChangeAtomId | undefined {
	const attachAndDetach = encoded.attachAndDetach;
	if (attachAndDetach === undefined) {
		return undefined;
	}
}

function tryGetEncodedCellRenameFromAttachAndDetach(
	encoded: Encoded.AttachAndDetach,
): EncodedChangeAtomId | undefined {
	// In documents generated by clients on release >=2.2 (i.e., running the code from the PR that added this comment),
	// renames are encoded as AttachAndDetach with a special id.
	// This ensures forward-compatibility of clients on release <=2.1 with documents/ops generated by clients on release >=2.2.
	if (encoded.attach.insert?.id === renameLocalId) {
		assert(
			encoded.detach.remove?.idOverride !== undefined,
			0x9f8 /* Rename must have idOverride */,
		);
		return encoded.detach.remove.idOverride;
	}
}
