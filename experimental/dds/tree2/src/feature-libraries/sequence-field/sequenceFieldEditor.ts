/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor, RevisionTag } from "../../core";
import { ChangesetLocalId, FieldEditor, NodeReviver } from "../modular-schema";
import { brand } from "../../util";
import {
	Changeset,
	DetachEvent,
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
	delete(index: number, count: number): Changeset<never>;
	revive(
		index: number,
		count: number,
		detachedBy: RevisionTag,
		reviver: NodeReviver,
		detachIndex: number,
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
		detachedBy: RevisionTag,
		detachIndex: number,
	): Changeset<never>;
}

export const sequenceFieldEditor = {
	buildChildChange: <TNodeChange = NodeChangeType>(
		index: number,
		change: TNodeChange,
	): Changeset<TNodeChange> => markAtIndex(index, { type: "Modify", changes: change }),
	insert: (
		index: number,
		cursors: readonly ITreeCursor[],
		id: ChangesetLocalId,
		detachedBy?: DetachEvent,
	): Changeset<never> => {
		const mark: Insert<never> = {
			type: "Insert",
			content: cursors.map(jsonableTreeFromCursor),
			id,
		};
		if (detachedBy !== undefined) {
			mark.detachedBy = detachedBy;
		}
		return markAtIndex(index, mark);
	},
	delete: (index: number, count: number): Changeset<never> =>
		count === 0 ? [] : markAtIndex(index, { type: "Delete", count }),
	revive: (
		index: number,
		count: number,
		detachEventRev: RevisionTag,
		reviver: NodeReviver,
		detachIndex?: number,
		isIntention: boolean = false,
		detachedBy?: DetachEvent,
	): Changeset<never> => {
		// Revives are typically created to undo a delete from the prior revision.
		// When that's the case, we know the content used to be at the index at which it is being revived.
		const computedDetachIndex = detachIndex ?? index;
		const detachEvent = { revision: detachEventRev, index: computedDetachIndex };
		const mark: Reattach<never> = {
			type: "Revive",
			content: reviver(detachEventRev, computedDetachIndex, count),
			count,
			detachEvent,
		};
		if (!isIntention) {
			mark.inverseOf = detachEventRev;
		}
		if (detachedBy !== undefined) {
			mark.detachedBy = detachedBy;
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
		};

		return [markAtIndex(sourceIndex, moveOut), markAtIndex(destIndex, moveIn)];
	},

	return(
		sourceIndex: number,
		count: number,
		destIndex: number,
		detachedBy: RevisionTag,
		detachIndex?: number,
	): Changeset<never> {
		if (count === 0) {
			return [];
		}

		// Returns are typically created to undo a move from the prior revision.
		// When that's the case, we know the content used to be at the index to which it is being returned.
		const computedDetachIndex = detachIndex ?? destIndex;
		const detachEvent = { revision: detachedBy, index: computedDetachIndex };
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
			detachEvent,
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
