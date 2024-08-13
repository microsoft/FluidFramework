/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ChangesetLocalId } from "../../core/index.js";
import type { FieldEditor, NodeId } from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import type {
	CellId,
	CellMark,
	Changeset,
	Insert,
	Mark,
	MarkList,
	MoveIn,
	MoveOut,
} from "./types.js";
import { splitMark } from "./utils.js";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
	insert(index: number, count: number, firstId: ChangesetLocalId): Changeset;
	remove(index: number, count: number, id: ChangesetLocalId): Changeset;
	revive(index: number, count: number, detachEvent: CellId, isIntention?: true): Changeset;

	/**
	 *
	 * @param sourceIndex - The index of the first node move
	 * @param count - The number of nodes to move
	 * @param destIndex - The index the nodes should be moved to, interpreted before detaching the moved nodes
	 * @param detachCellId - The local ID to assign to the first cell being emptied by the move
	 * @param attachCellId - The local ID to assign to the first cell being filled by the move
	 */
	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachCellId: ChangesetLocalId,
		attachCellId: ChangesetLocalId,
	): Changeset;

	moveOut(sourceIndex: number, count: number, id: ChangesetLocalId): Changeset;
	moveIn(
		destIndex: number,
		count: number,
		moveId: ChangesetLocalId,
		attachCellId: ChangesetLocalId,
	): Changeset;

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachCellId: CellId,
		attachCellId: CellId,
	): Changeset;
}

export const sequenceFieldEditor = {
	buildChildChange: (index: number, change: NodeId): Changeset =>
		markAtIndex(index, { count: 1, changes: change }),
	insert: (index: number, count: number, firstId: ChangesetLocalId): Changeset => {
		const mark: CellMark<Insert> = {
			type: "Insert",
			id: firstId,
			count,
			cellId: { localId: firstId },
		};
		return markAtIndex(index, mark);
	},
	remove: (index: number, count: number, id: ChangesetLocalId): Changeset =>
		count === 0 ? [] : markAtIndex(index, { type: "Remove", count, id }),

	revive: (index: number, count: number, detachEvent: CellId): Changeset => {
		assert(detachEvent.revision !== undefined, 0x724 /* Detach event must have a revision */);
		const mark: CellMark<Insert> = {
			type: "Insert",
			id: detachEvent.localId,
			count,
			cellId: detachEvent,
		};
		return count === 0 ? [] : markAtIndex(index, mark);
	},

	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachCellId: ChangesetLocalId,
		attachCellId: ChangesetLocalId,
	): Changeset {
		const moveIn: Mark = {
			type: "MoveIn",
			id: detachCellId,
			count,
			cellId: { localId: attachCellId },
		};
		const moveOut: Mark = {
			type: "MoveOut",
			id: detachCellId,
			count,
		};
		return moveMarksToMarkList(sourceIndex, count, destIndex, moveOut, moveIn);
	},

	moveOut(sourceIndex: number, count: number, detachCellId: ChangesetLocalId): Changeset {
		const moveOut: Mark = {
			type: "MoveOut",
			id: detachCellId,
			count,
		};
		return markAtIndex(sourceIndex, moveOut);
	},

	moveIn(
		destIndex: number,
		count: number,
		moveId: ChangesetLocalId,
		attachCellId: ChangesetLocalId,
	): Changeset {
		const moveIn: Mark = {
			type: "MoveIn",
			id: moveId,
			count,
			cellId: { localId: attachCellId },
		};
		return markAtIndex(destIndex, moveIn);
	},

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachCellId: CellId,
		attachCellId: CellId,
	): Changeset {
		const moveOut: CellMark<MoveOut> = {
			type: "MoveOut",
			id: attachCellId.localId,
			idOverride: detachCellId,
			count,
		};

		const returnTo: CellMark<MoveIn> = {
			type: "MoveIn",
			id: attachCellId.localId,
			count,
			cellId: attachCellId,
		};

		return moveMarksToMarkList(sourceIndex, count, destIndex, moveOut, returnTo);
	},
} satisfies SequenceFieldEditor;

function moveMarksToMarkList(
	sourceIndex: number,
	count: number,
	destIndex: number,
	detach: CellMark<MoveOut>,
	attach: CellMark<MoveIn>,
): MarkList {
	if (count === 0) {
		return [];
	}
	const firstIndexBeyondMoveOut = sourceIndex + count;
	const marks = new MarkListFactory();
	marks.pushOffset(Math.min(sourceIndex, destIndex));
	if (destIndex <= sourceIndex) {
		// The destination is fully before the source
		marks.pushContent(attach);
		marks.pushOffset(sourceIndex - destIndex);
		marks.pushContent(detach);
	} else if (firstIndexBeyondMoveOut <= destIndex) {
		// The destination is fully after the source
		marks.pushContent(detach);
		marks.pushOffset(destIndex - firstIndexBeyondMoveOut);
		marks.pushContent(attach);
	} else {
		const firstSectionLength = destIndex - sourceIndex;
		// The destination is in the middle of the source
		const [detach1, detach2] = splitMark(detach, firstSectionLength);
		marks.pushContent(detach1);
		marks.pushContent(attach);
		marks.pushContent(detach2);
	}
	return marks.list;
}

function markAtIndex(index: number, mark: Mark): Changeset {
	return index === 0 ? [mark] : [{ count: index }, mark];
}
