/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, RevisionTag, TaggedChange, tagChange } from "../../core";
import { Brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import { populateChildModifications } from "../deltaUtils";

export type CellId = Brand<unknown, "CellId">;

export interface CrossCellManager<TDeepChange> {
	initiateMoveOut(
		srcMoveId: Delta.MoveId,
		srcMoveRevision: RevisionTag | undefined,
		moveOut: ContentMove | undefined,
		change: TDeepChange | undefined,
	): void;
	initiateMoveIn(dstId: CellId, moveId: Delta.MoveId): void;
	send(id: Delta.MoveId, revision: RevisionTag | undefined, deep: TDeepChange): void;
	receive(id: Delta.MoveId, revision: RevisionTag | undefined): TDeepChange | undefined;
}

export type IdNormalizer = (id: Delta.MoveId, revision: RevisionTag | undefined) => Delta.MoveId;

export interface ContentMove {
	readonly cell: CellId;
	readonly moveId: Delta.MoveId;
}

// TODO: Degree of freedom for: global vs local (assume local for now)
// TODO: Degree of freedom for: reachability of destination
export interface Change<TDeepChange> {
	/**
	 * The destination for the content that was in the cell before this change.
	 * If undefined, the cell was be empty before this change.
	 */
	readonly oldContentDst?: ContentMove;

	/**
	 * The source for the content that will be in the cell after this change.
	 * If undefined, the cell will be empty after this change.
	 */
	readonly newContentSrc?: ContentMove;

	/**
	 * Changes internal to the content that was in the cell before this change.
	 */
	readonly deep?: TDeepChange;
}

export function encodeForJson<TDeepChange>(
	formatVersion: number,
	change: Change<TDeepChange>,
	encodeChild: (change: TDeepChange) => JsonCompatibleReadOnly,
): JsonCompatibleReadOnly {
	const result: Mutable<Change<JsonCompatibleReadOnly>> & JsonCompatibleReadOnly = {};
	if (change.oldContentDst !== undefined) {
		result.oldContentDst = change.oldContentDst;
	}
	if (change.newContentSrc !== undefined) {
		result.newContentSrc = change.newContentSrc;
	}
	if (change.deep !== undefined) {
		result.deep = encodeChild(change.deep);
	}
	return result;
}

export function decodeJson<TDeepChange>(
	formatVersion: number,
	change: JsonCompatibleReadOnly,
	decodeChild: (change: JsonCompatibleReadOnly) => TDeepChange,
): Change<TDeepChange> {
	const encoded = change as Mutable<Change<JsonCompatibleReadOnly>>;
	const result: Mutable<Change<TDeepChange>> = {};
	if (encoded.oldContentDst !== undefined) {
		result.oldContentDst = encoded.oldContentDst;
	}
	if (encoded.newContentSrc !== undefined) {
		result.newContentSrc = encoded.newContentSrc;
	}
	if (encoded.deep !== undefined) {
		result.deep = decodeChild(encoded.deep);
	}
	return result;
}

export function intoDelta<TDeepChange>(
	change: Change<TDeepChange>,
	deltaFromDeep: (child: TDeepChange) => Delta.Modify,
): Delta.MarkList {
	const marks: Delta.Mark[] = [];
	if (change.oldContentDst !== undefined) {
		const remove: Mutable<Delta.MoveOut> = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: change.oldContentDst.moveId,
		};
		if (change.deep !== undefined) {
			const modify = deltaFromDeep(change.deep);
			populateChildModifications(modify, remove);
		}
		marks.push(remove);
	} else {
		return change.deep === undefined ? [] : [deltaFromDeep(change.deep)];
	}
	if (change.newContentSrc !== undefined) {
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: change.newContentSrc.moveId,
		};
		marks.push(moveIn);
	}
	return marks;
}

export function isEmpty(change: Change<unknown>): boolean {
	return (
		change.oldContentDst === undefined &&
		change.newContentSrc === undefined &&
		change.deep === undefined
	);
}

export function editCellContent<TDeepChange>(deep: TDeepChange): Change<TDeepChange> {
	return { deep };
}

export function clearContent(
	oldContentDstCell: CellId,
	oldContentMoveId: Delta.MoveId,
): Change<never> {
	return { oldContentDst: { cell: oldContentDstCell, moveId: oldContentMoveId } };
}

export function insertContent(
	newContentSrcCell: CellId,
	newContentMoveId: Delta.MoveId,
): Change<never> {
	return { newContentSrc: { cell: newContentSrcCell, moveId: newContentMoveId } };
}

export function replaceContent(
	oldContentDstCell: CellId,
	oldContentMoveId: Delta.MoveId,
	newContentSrcCell: CellId,
	newContentMoveId: Delta.MoveId,
): Change<never> {
	return oldContentMoveId === newContentMoveId
		? {}
		: {
				oldContentDst: { cell: oldContentDstCell, moveId: oldContentMoveId },
				newContentSrc: { cell: newContentSrcCell, moveId: newContentMoveId },
		  };
}

export function compose<TDeepChange>(
	changes: TaggedChange<Change<TDeepChange>>[],
	composeDeep: (changes: TaggedChange<TDeepChange>[]) => TDeepChange,
	crossCellManager: CrossCellManager<TDeepChange>,
	idNormalizer: IdNormalizer,
): Change<TDeepChange> {
	if (changes.length < 2) {
		return changes.length === 0 ? {} : changes[0].change;
	}
	const normalizeMove = (
		move: ContentMove | undefined,
		revision: RevisionTag | undefined,
	): ContentMove | undefined => {
		if (move !== undefined) {
			return {
				cell: move.cell,
				moveId: idNormalizer(move.moveId, revision),
			};
		}
		return undefined;
	};

	const composed: Mutable<Change<TDeepChange>> = {};
	for (const { change, revision } of changes) {
		if (change.oldContentDst !== undefined) {
			if (composed.newContentSrc !== undefined) {
			}
		}
	}

	return composed;
}

export function invert<TDeepChange>(
	{ change, revision }: TaggedChange<Change<TDeepChange>>,
	invertDeep: (change: TDeepChange) => TDeepChange,
	crossCellManager: CrossCellManager<TDeepChange>,
): Change<TDeepChange> {
	const inverted: Mutable<Change<TDeepChange>> = {};
	if (change.newContentSrc !== undefined) {
		// We need to put on this changeset the inverse of any deep changes that were applied to the source of the
		// original content.
		const deep = crossCellManager.receive(change.newContentSrc.moveId, revision);
		if (deep !== undefined) {
			inverted.deep = deep;
		}
		inverted.oldContentDst = change.newContentSrc;
	}
	if (change.oldContentDst !== undefined) {
		const deep = change.deep !== undefined ? invertDeep(change.deep) : undefined;
		if (deep !== undefined) {
			// The inverse of the changes to the original content should reside where that content was sent.
			crossCellManager.send(change.oldContentDst.moveId, revision, deep);
		}
		inverted.newContentSrc = change.oldContentDst;
	}
	return inverted;
}

export function rebase<TDeepChange>(
	change: Change<TDeepChange>,
	over: TaggedChange<Change<TDeepChange>>,
	detachedCellAllocator: () => CellId,
	moveIdAllocator: () => Delta.MoveId,
	rebaseDeep: (
		change: TDeepChange | undefined,
		baseChange: TDeepChange | undefined,
	) => TDeepChange | undefined,
	crossCellManager: CrossCellManager<TDeepChange>,
): Change<TDeepChange> {
	const rebased: Mutable<Change<TDeepChange>> = { ...change };

	const deep = rebaseDeep(change.deep, over.change.deep);
	if (deep !== undefined) {
		rebased.deep = deep;
	} else {
		delete rebased.deep;
	}

	if (over.change.oldContentDst !== undefined) {
		// Since the content has been replaced by the concurrent change, the deep changes to it should
		// reside at its new location.
		// If the content was being moved, it also now needs to be moved out of where `over` put it.
		crossCellManager.initiateMoveOut(
			over.change.oldContentDst.moveId,
			over.revision,
			change.oldContentDst, // PB: if the old content was moved somewhere reachable, this will trash it.
			deep,
		);
		delete rebased.deep;
		delete rebased.oldContentDst;
	}

	if (over.change.newContentSrc !== undefined && change.newContentSrc !== undefined) {
		// This change will overwrite the content put in place by `over`.
		const trashCell = detachedCellAllocator();
		const trashMoveId = moveIdAllocator();
		crossCellManager.initiateMoveIn(trashCell, trashMoveId);
		rebased.oldContentDst = { cell: trashCell, moveId: trashMoveId };
		// Any deep changes (within this revision) that apply to the content put in place by `over` should
		// now be represented as part of the change on this cell.
		const newDeep = crossCellManager.receive(over.change.newContentSrc.moveId, over.revision);
		if (newDeep !== undefined) {
			rebased.deep = newDeep;
		}
	}
	return rebased;
}
