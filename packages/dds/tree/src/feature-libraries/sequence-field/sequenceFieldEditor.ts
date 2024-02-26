/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ChangesetLocalId } from "../../core/index.js";
import { FieldEditor } from "../modular-schema/index.js";
import { brand } from "../../util/index.js";
import {
	CellId,
	CellMark,
	Changeset,
	Insert,
	Mark,
	MoveId,
	NodeChangeType,
	MoveOut,
	MoveIn,
	MarkList,
} from "./types.js";
import { MarkListFactory } from "./markListFactory.js";
import { splitMark } from "./utils.js";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
	insert(index: number, count: number, firstId: ChangesetLocalId): Changeset<never>;
	remove(index: number, count: number, id: ChangesetLocalId): Changeset<never>;
	revive(index: number, count: number, detachEvent: CellId, isIntention?: true): Changeset<never>;

	/**
	 *
	 * @param sourceIndex - The index of the first node move
	 * @param count - The number of nodes to move
	 * @param destIndex - The index the nodes should be moved to, interpreted before detaching the moved nodes
	 */
	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		id: ChangesetLocalId,
	): Changeset<never>;

	moveOut(sourceIndex: number, count: number, id: ChangesetLocalId): Changeset<never>;
	moveIn(destIndex: number, count: number, id: ChangesetLocalId): Changeset<never>;

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachEvent: CellId,
	): Changeset<never>;
}

export const sequenceFieldEditor = {
	buildChildChange: <TNodeChange = NodeChangeType>(
		index: number,
		change: TNodeChange,
	): Changeset<TNodeChange> => markAtIndex(index, { count: 1, changes: change }),
	insert: (index: number, count: number, firstId: ChangesetLocalId): Changeset<never> => {
		const mark: CellMark<Insert, never> = {
			type: "Insert",
			id: firstId,
			count,
			cellId: { localId: firstId },
		};
		return markAtIndex(index, mark);
	},
	remove: (index: number, count: number, id: ChangesetLocalId): Changeset<never> =>
		count === 0 ? [] : markAtIndex(index, { type: "Remove", count, id }),

	revive: (index: number, count: number, detachEvent: CellId): Changeset<never> => {
		assert(detachEvent.revision !== undefined, 0x724 /* Detach event must have a revision */);
		const mark: CellMark<Insert, never> = {
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
		id: ChangesetLocalId,
	): Changeset<never> {
		const moveIn: Mark<never> = {
			type: "MoveIn",
			id,
			count,
			cellId: { localId: id },
		};
		const moveOut: Mark<never> = {
			type: "MoveOut",
			id,
			count,
		};
		return moveMarksToMarkList(sourceIndex, count, destIndex, moveOut, moveIn);
	},

	moveOut(sourceIndex: number, count: number, id: ChangesetLocalId): Changeset<never> {
		const moveOut: Mark<never> = {
			type: "MoveOut",
			id,
			count,
		};
		return markAtIndex(sourceIndex, moveOut);
	},

	moveIn(destIndex: number, count: number, id: ChangesetLocalId): Changeset<never> {
		const moveIn: Mark<never> = {
			type: "MoveIn",
			id,
			count,
			cellId: { localId: id },
		};
		return markAtIndex(destIndex, moveIn);
	},

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachEvent: CellId,
	): Changeset<never> {
		const id = brand<MoveId>(0);
		const moveOut: CellMark<MoveOut, never> = {
			type: "MoveOut",
			id,
			count,
		};

		const returnTo: CellMark<MoveIn, never> = {
			type: "MoveIn",
			id,
			count,
			cellId: detachEvent,
		};

		return moveMarksToMarkList(sourceIndex, count, destIndex, moveOut, returnTo);
	},
} satisfies SequenceFieldEditor;

function moveMarksToMarkList(
	sourceIndex: number,
	count: number,
	destIndex: number,
	detach: CellMark<MoveOut, never>,
	attach: CellMark<MoveIn, never>,
): MarkList<never> {
	if (count === 0) {
		return [];
	}
	const firstIndexBeyondMoveOut = sourceIndex + count;
	const marks = new MarkListFactory<never>();
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

function markAtIndex<TNodeChange>(index: number, mark: Mark<TNodeChange>): Changeset<TNodeChange> {
	return index === 0 ? [mark] : [{ count: index }, mark];
}
