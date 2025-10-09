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
import {
	EncodedNodeChangeset,
	getFromChangeAtomIdMap,
	rangeQueryChangeAtomIdMap,
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
import { getAttachedRootId, getDetachedRootId, isNoopMark, splitMark } from "./utils.js";

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

			const attachId = getAttachedRootId(mark);
			if (cellId !== undefined && !areEqualChangeAtomIds(cellId, attachId)) {
				context.decodeRootRename(cellId, attachId, count);
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
				idOverride !== undefined
					? changeAtomIdCodec.decode(idOverride, context.baseContext)
					: undefined;

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
				idOverride !== undefined
					? changeAtomIdCodec.decode(idOverride, context.baseContext)
					: undefined;

			const decodedRevision = decodeRevision(revision, context.baseContext);
			if (finalEndpoint !== undefined) {
				const decodedEndpoint = changeAtomIdCodec.decode(finalEndpoint, context.baseContext);
				return decodeDetach(
					cellId,
					count,
					decodedEndpoint.revision ?? fail("Revision should be defined"),
					decodedEndpoint.localId,
					cellRename,
					{ revision: decodedRevision, localId: id },
					context,
				);
			}

			return decodeDetach(cellId, count, decodedRevision, id, cellRename, undefined, context);
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

			assert(cellId !== undefined, "Attach and detach should target an empty cell");
			const isNodeMove = encoded.attach.moveIn !== undefined;
			if (!isNodeMove) {
				context.decodeRootRename(cellId, detachId, count);
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
	detachCellId: ChangeAtomId | undefined,
	context: FieldChangeEncodingContext,
): Detach | Rename {
	const detachId: ChangeAtomId = { revision, localId };
	if (cellId !== undefined) {
		context.decodeRootRename(cellId, detachId, count);
		// XXX: detachCellId
		return {
			type: "Rename",
			idOverride: cellRename ?? detachId,
		};
	}

	const mark: Mutable<Detach> = {
		type: "Remove",
		revision,
		id: localId,
	};

	if (cellRename !== undefined) {
		mark.cellRename = cellRename;
	}

	if (detachCellId !== undefined) {
		mark.detachCellId = detachCellId;
	}

	return mark;
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
					if (decodedMark.cellId !== undefined) {
						context.decodeRootNodeChange(decodedMark.cellId, mark.changes);
					} else {
						decodedMark.changes = context.decodeNode(mark.changes);
					}
				}

				marks.push(decodedMark);
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

	const inputDetachId = context.getInputDetachId(mark.idOverride, mark.count).value;
	const isMoveInAndDetach =
		context.isDetachId(mark.idOverride, mark.count).value ||
		(inputDetachId !== undefined && !areEqualChangeAtomIds(inputDetachId, mark.cellId));

	if (isMoveInAndDetach) {
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

	const renamedRootId = context.rootRenames.getFirst(mark.cellId, mark.count).value;

	const outputRootId = renamedRootId ?? mark.cellId;
	const isMoveOutAndAttach = context.isAttachId(outputRootId, mark.count).value;
	const isMoveOutAndDetach = !areEqualChangeAtomIds(outputRootId, mark.idOverride);
	if (isMoveOutAndAttach || isMoveOutAndDetach) {
		// Detached nodes which were last at this cell location have been moved.
		return {
			moveOut: {
				revision: encodeRevision(outputRootId.revision),
				id: outputRootId.localId,
				idOverride: changeAtomIdCodec.encode(mark.idOverride, context.baseContext),
			},
		};
	}

	if (renamedRootId !== undefined) {
		return {
			remove: {
				revision: encodeRevision(outputRootId.revision),
				id: outputRootId.localId,
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
	let count =
		mark.cellId !== undefined
			? rangeQueryChangeAtomIdMap(context.rootNodeChanges, mark.cellId, mark.count).length
			: mark.count;

	if (mark.cellId !== undefined) {
		count = context.getInputDetachId(mark.cellId, count).length;
	}

	switch (mark.type) {
		case "Insert":
			count = context.isDetachId(getAttachedRootId(mark), count).length;
			break;
		case "Remove":
			count = context.isAttachId(getDetachedRootId(mark), count).length;
			break;
		case "Rename":
			// XXX
			break;
		default:
			break;
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
		case "Insert": {
			const attachId = getAttachedRootId(mark);
			const isMove = context.isDetachId(attachId, 1).value;

			// If the input context ID for these nodes is not the cell ID,
			// then these nodes are being moved from the location at which they were last detached.
			const inputId = context.getInputDetachId(attachId, mark.count).value ?? attachId;
			const isInitialAttachLocation =
				mark.cellId === undefined || areEqualChangeAtomIds(mark.cellId, inputId);

			return isMove || !isInitialAttachLocation
				? {
						moveIn: { revision: encodeRevision(mark.revision), id: mark.id },
					}
				: {
						insert: {
							revision: encodeRevision(mark.revision),
							id: mark.id,
						},
					};
		}
		case "Remove": {
			const encodedIdOverride =
				mark.cellRename !== undefined
					? changeAtomIdCodec.encode(mark.cellRename, context.baseContext)
					: undefined;

			const detachId = getDetachedRootId(mark);
			const isMove = context.isAttachId(detachId, 1).value;

			const outputCellId = mark.cellRename ?? mark.detachCellId ?? detachId;

			// If the final detach location for the nodes were here,
			// then the output cell ID would be the same as the detach ID.
			// So if the cell ID is different from the detach ID, the nodes must have been moved.
			const isFinalDetachLocation = areEqualChangeAtomIds(detachId, outputCellId);

			const isMoveOrDetachedMove = isMove || !isFinalDetachLocation;
			if (mark.detachCellId !== undefined) {
				assert(
					isMoveOrDetachedMove,
					"Only detaches representing a move out should specify a detach cell ID",
				);

				// XXX: Set final endpoint on the move in.
				return {
					moveOut: {
						revision: encodeRevision(mark.detachCellId.revision),
						id: mark.detachCellId.localId,
						idOverride: encodedIdOverride,
						finalEndpoint: changeAtomIdCodec.encode(
							{ revision: mark.revision, localId: mark.id },
							context.baseContext,
						),
					},
				};
			}

			const encodedRevision = encodeRevision(mark.revision);
			return isMoveOrDetachedMove
				? {
						moveOut: {
							revision: encodedRevision,
							id: mark.id,
							idOverride: encodedIdOverride,
						},
					}
				: {
						remove: {
							revision: encodedRevision,
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

/**
 * Arbitrary ID that is used to indicate a Rename effect.
 */
const renameLocalId: ChangesetLocalId = brand(-1);
