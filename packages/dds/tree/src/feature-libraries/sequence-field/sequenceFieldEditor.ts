/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor } from "../treeTextCursor";
import { ITreeCursor, RevisionTag } from "../../core";
import { FieldEditor } from "../modular-schema";
import { brand } from "../../util";
import { Changeset, Mark, MoveId, NodeChangeType, Reattach } from "./format";
import { MarkListFactory } from "./markListFactory";

export interface SequenceFieldEditor extends FieldEditor<Changeset> {
	insert(index: number, cursor: ITreeCursor | ITreeCursor[]): Changeset<never>;
	delete(index: number, count: number): Changeset<never>;
	revive(
		index: number,
		count: number,
		detachedBy: RevisionTag,
		detachIndex: number,
		isIntention?: true,
	): Changeset<never>;

	/**
	 *
	 * @param sourceIndex - The index of the first node move
	 * @param count - The number of nodes to move
	 * @param destIndex - The index the nodes should be moved to, interpreted after removing the moving nodes
	 */
	move(sourceIndex: number, count: number, destIndex: number): Changeset<never>;
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
	insert: (index: number, cursors: ITreeCursor | ITreeCursor[]): Changeset<never> =>
		markAtIndex(index, {
			type: "Insert",
			content: Array.isArray(cursors)
				? cursors.map(jsonableTreeFromCursor)
				: [jsonableTreeFromCursor(cursors)],
		}),
	delete: (index: number, count: number): Changeset<never> =>
		count === 0 ? [] : markAtIndex(index, { type: "Delete", count }),
	revive: (
		index: number,
		count: number,
		detachedBy: RevisionTag,
		detachIndex?: number,
		isIntention?: true,
	): Changeset<never> => {
		const mark: Reattach<never> = {
			type: "Revive",
			count,
			detachedBy,
			// Revives are typically created to undo a delete from the prior revision.
			// When that's the case, we know the content used to be at the index at which it is being revived.
			detachIndex: detachIndex ?? index,
		};
		if (isIntention) {
			mark.isIntention = true;
		}
		return count === 0 ? [] : markAtIndex(index, mark);
	},
	move(sourceIndex: number, count: number, destIndex: number): Changeset<never> {
		if (count === 0 || sourceIndex === destIndex) {
			// TODO: Should we allow creating a move which has no observable effect?
			return [];
		}

		const moveOut: Mark<never> = {
			type: "MoveOut",
			id: brand(0),
			count,
		};

		const moveIn: Mark<never> = {
			type: "MoveIn",
			id: brand(0),
			count,
		};

		const factory = new MarkListFactory<never>();
		if (sourceIndex < destIndex) {
			factory.pushOffset(sourceIndex);
			factory.pushContent(moveOut);
			factory.pushOffset(destIndex - sourceIndex);
			factory.pushContent(moveIn);
		} else {
			factory.pushOffset(destIndex);
			factory.pushContent(moveIn);
			factory.pushOffset(sourceIndex - destIndex);
			factory.pushContent(moveOut);
		}
		return factory.list;
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

		const id = brand<MoveId>(0);
		const returnFrom: Mark<never> = {
			type: "ReturnFrom",
			id,
			count,
			detachedBy,
		};

		const returnTo: Mark<never> = {
			type: "ReturnTo",
			id,
			count,
			detachedBy,
			// Returns are typically created to undo a move from the prior revision.
			// When that's the case, we know the content used to be at the index to which it is being returned.
			detachIndex: detachIndex ?? destIndex,
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
	return index === 0 ? [mark] : [index, mark];
}
