/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ChangesetLocalId, ITreeCursor } from "../../core";
import { FieldEditor } from "../modular-schema";
import { brand } from "../../util";
import {
	CellId,
	CellMark,
	Changeset,
	Insert,
	Mark,
	MoveId,
	NodeChangeType,
	ReturnFrom,
	MoveIn,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { splitMark } from "./utils";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
	insert(index: number, cursor: readonly ITreeCursor[], id: ChangesetLocalId): Changeset<never>;
	delete(index: number, count: number, id: ChangesetLocalId): Changeset<never>;
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
	insert: (
		index: number,
		cursors: readonly ITreeCursor[],
		id: ChangesetLocalId,
	): Changeset<never> => {
		const mark: CellMark<Insert, never> = {
			type: "Insert",
			count: cursors.length,
			content: cursors.map(jsonableTreeFromCursor),
			cellId: { localId: id },
		};
		return markAtIndex(index, mark);
	},
	delete: (index: number, count: number, id: ChangesetLocalId): Changeset<never> =>
		count === 0 ? [] : markAtIndex(index, { type: "Delete", count, id }),

	revive: (
		index: number,
		count: number,
		detachEvent: CellId,
		isIntention: boolean = false,
	): Changeset<never> => {
		assert(detachEvent.revision !== undefined, 0x724 /* Detach event must have a revision */);
		const mark: CellMark<Insert, never> = {
			type: "Insert",
			count,
			cellId: detachEvent,
		};
		if (!isIntention) {
			mark.inverseOf = detachEvent.revision;
		}
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
		const firstIndexBeyondMoveOut = sourceIndex + count;
		const marks = new MarkListFactory<never>();
		marks.pushOffset(Math.min(sourceIndex, destIndex));
		if (destIndex <= sourceIndex) {
			// The destination is fully before the source
			marks.pushContent(moveIn);
			marks.pushOffset(sourceIndex - destIndex);
			marks.pushContent(moveOut);
		} else if (firstIndexBeyondMoveOut <= destIndex) {
			// The destination is fully after the source
			marks.pushContent(moveOut);
			marks.pushOffset(destIndex - firstIndexBeyondMoveOut);
			marks.pushContent(moveIn);
		} else {
			const firstSectionLength = destIndex - sourceIndex;
			// The destination is in the middle of the source
			const [moveOut1, moveOut2] = splitMark(moveOut, firstSectionLength);
			marks.pushContent(moveOut1);
			marks.pushContent(moveIn);
			marks.pushContent(moveOut2);
		}
		return marks.list;
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
		if (count === 0) {
			return [];
		}

		const id = brand<MoveId>(0);
		const returnFrom: CellMark<ReturnFrom, never> = {
			type: "ReturnFrom",
			id,
			count,
		};

		const returnTo: CellMark<MoveIn, never> = {
			type: "MoveIn",
			id,
			count,
			cellId: detachEvent,
		};

		const factory = new MarkListFactory<never>();
		if (sourceIndex < destIndex) {
			factory.pushOffset(sourceIndex);
			factory.pushContent(returnFrom);
			factory.pushOffset(destIndex - sourceIndex);
			factory.pushContent(returnTo);
		} else {
			factory.pushOffset(destIndex);
			factory.pushContent(returnTo);
			factory.pushOffset(sourceIndex - destIndex);
			factory.pushContent(returnFrom);
		}
		return factory.list;
	},
};

function markAtIndex<TNodeChange>(index: number, mark: Mark<TNodeChange>): Changeset<TNodeChange> {
	return index === 0 ? [mark] : [{ count: index }, mark];
}
