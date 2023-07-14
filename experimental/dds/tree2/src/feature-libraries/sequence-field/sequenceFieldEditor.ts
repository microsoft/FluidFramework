/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor, RevisionTag } from "../../core";
import { ChangeAtomId, ChangesetLocalId, FieldEditor, NodeReviver } from "../modular-schema";
import { brand } from "../../util";
import {
	Changeset,
	Insert,
	LineageEvent,
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
		detachedBy: RevisionTag,
		detachId: ChangesetLocalId,
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
		detachedBy: RevisionTag,
		detachId: ChangesetLocalId,
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
	): Changeset<never> => {
		const mark: Insert<never> = {
			type: "Insert",
			content: cursors.map(jsonableTreeFromCursor),
			id,
		};
		return markAtIndex(index, mark);
	},
	delete: (index: number, count: number, id: ChangesetLocalId): Changeset<never> =>
		count === 0 ? [] : markAtIndex(index, { type: "Delete", count, id }),
	revive: (
		index: number,
		count: number,
		detachedBy: RevisionTag,
		detachId: ChangesetLocalId,
		reviver: NodeReviver,
		isIntention: boolean = false,
	): Changeset<never> => {
		const detachEvent = { revision: detachedBy, localId: detachId };
		const mark: Reattach<never> = {
			type: "Revive",
			content: reviver(detachedBy, detachId, count),
			count,
			detachEvent,
		};
		if (!isIntention) {
			mark.inverseOf = detachedBy;
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
		detachId: ChangesetLocalId,
		lineage?: LineageEvent[],
	): Changeset<never> {
		if (count === 0) {
			return [];
		}

		const detachEvent = { revision: detachedBy, localId: detachId };
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

		if (lineage !== undefined) {
			returnTo.lineage = lineage;
		}

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
