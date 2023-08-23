/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ChangesetLocalId, ITreeCursor } from "../../core";
import { FieldEditor, NodeReviver } from "../modular-schema";
import { brand } from "../../util";
import {
	CellId,
	Changeset,
	Insert,
	Mark,
	MoveId,
	NodeChangeType,
	Reattach,
	ReturnFrom,
	ReturnTo,
} from "./format";
import { MarkListFactory } from "./markListFactory";

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
	): Changeset<TNodeChange> => markAtIndex(index, { count: 1, changes: change }),
	insert: (
		index: number,
		cursors: readonly ITreeCursor[],
		id: ChangesetLocalId,
	): Changeset<never> => {
		const mark: Insert<never> = {
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
		reviver: NodeReviver,
		isIntention: boolean = false,
	): Changeset<never> => {
		assert(detachEvent.revision !== undefined, 0x724 /* Detach event must have a revision */);
		const mark: Reattach<never> = {
			type: "Revive",
			content: reviver(detachEvent.revision, detachEvent.localId, count),
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
	): [moveOut: Changeset<never>, moveIn: Changeset<never>] {
		const moveOut: Mark<never> = {
			type: "MoveOut",
			id,
			count,
		};

		const moveIn: Mark<never> = {
			type: "MoveIn",
			id,
			count,
			cellId: { localId: id },
		};

		return [markAtIndex(sourceIndex, moveOut), markAtIndex(destIndex, moveIn)];
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
		const returnFrom: ReturnFrom<never> = {
			type: "ReturnFrom",
			id,
			count,
		};

		const returnTo: ReturnTo = {
			type: "ReturnTo",
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
