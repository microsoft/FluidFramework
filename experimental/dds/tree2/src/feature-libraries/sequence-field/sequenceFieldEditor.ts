/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor } from "../../core";
import { ChangesetLocalId, FieldEditor, NodeReviver } from "../modular-schema";
import { brand } from "../../util";
import {
	CellId,
	Changeset,
	Effect,
	Insert,
	Mark,
	MoveId,
	NodeChangeType,
	Reattach,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { ReturnFromMark, ReturnToMark } from "./helperTypes";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
	insert(index: number, cursor: readonly ITreeCursor[], id: ChangesetLocalId): Changeset<never>;
	delete(index: number, count: number, id: ChangesetLocalId): Changeset<never>;
	revive(
		index: number,
		count: number,
		detachEvent: CellId,
		reviver: NodeReviver,
		isIntention?: true,
	): Changeset<never>;

	/**
	 *
	 * @param sourceIndex - The index of the first node move
	 * @param count - The number of nodes to move
	 * @param destIndex - The index the nodes should be moved to, interpreted after removing the moving nodes
	 * @returns a tuple containing a changeset for the move out and a changeset for the move in
	 */
	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		id: ChangesetLocalId,
	): [moveOut: Changeset<never>, moveIn: Changeset<never>];
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
	): Changeset<TNodeChange> => markAtIndex(index, 1, { type: "Modify", changes: change }),
	insert: (
		index: number,
		cursors: readonly ITreeCursor[],
		id: ChangesetLocalId,
	): Changeset<never> => {
		const mark: Insert<never> = {
			type: "Insert",
			content: cursors.map(jsonableTreeFromCursor),
			id,
		};
		return markAtIndex(index, cursors.length, mark);
	},
	delete: (index: number, count: number, id: ChangesetLocalId): Changeset<never> =>
		markAtIndex(index, count, { type: "Delete", id }),

	revive: (
		index: number,
		count: number,
		cellId: CellId,
		reviver: NodeReviver,
		isIntention: boolean = false,
	): Changeset<never> => {
		assert(cellId.revision !== undefined, "Detach event must have a revision");
		const effect: Reattach<never> = {
			type: "Revive",
			content: reviver(cellId.revision, cellId.localId, count),
		};
		if (!isIntention) {
			effect.inverseOf = cellId.revision;
		}
		return markAtIndex(index, count, effect, cellId);
	},

	move(
		sourceIndex: number,
		count: number,
		destIndex: number,
		id: ChangesetLocalId,
	): [moveOut: Changeset<never>, moveIn: Changeset<never>] {
		const moveOut: Effect<never> = {
			type: "MoveOut",
			id,
		};

		const moveIn: Effect<never> = {
			type: "MoveIn",
			id,
		};

		return [markAtIndex(sourceIndex, count, moveOut), markAtIndex(destIndex, count, moveIn)];
	},

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		cellId: CellId,
	): Changeset<never> {
		if (count === 0) {
			return [];
		}

		const id = brand<MoveId>(0);
		const returnFrom: ReturnFromMark<never> = {
			count,
			effect: {
				type: "ReturnFrom",
				id,
			},
		};

		const returnTo: ReturnToMark = {
			count,
			cellId,
			effect: {
				type: "ReturnTo",
				id,
			},
		};

		const factory = new MarkListFactory<never>();
		if (sourceIndex < destIndex) {
			factory.pushOffset(sourceIndex);
			factory.pushMark(returnFrom);
			factory.pushOffset(destIndex - sourceIndex);
			factory.pushMark(returnTo);
		} else {
			factory.pushOffset(destIndex);
			factory.pushMark(returnTo);
			factory.pushOffset(sourceIndex - destIndex);
			factory.pushMark(returnFrom);
		}
		return factory.list;
	},
};

function markAtIndex<TNodeChange>(
	index: number,
	count: number,
	effect: Effect<TNodeChange>,
	cellId?: CellId,
): Changeset<TNodeChange> {
	if (count === 0) {
		return [];
	}
	const mark: Mark<TNodeChange> = { count, effect };
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return index === 0 ? [mark] : [{ count: index }, mark];
}
