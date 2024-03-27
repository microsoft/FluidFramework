/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { isNewAttach } from "../../../feature-libraries/sequence-field/utils.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";

const tag: RevisionTag = mintRevisionTag();

export type TestChangeset = SF.Changeset<TestChange>;

export const cases: {
	no_change: TestChangeset;
	insert: TestChangeset;
	modify: TestChangeset;
	modify_insert: TestChangeset;
	remove: TestChangeset;
	revive: TestChangeset;
	pin: TestChangeset;
	move: TestChangeset;
	return: TestChangeset;
	transient_insert: TestChangeset;
} = {
	no_change: [],
	insert: createInsertChangeset(1, 2, brand(1)),
	modify: SF.sequenceFieldEditor.buildChildChange(0, TestChange.mint([], 1)),
	modify_insert: [
		createSkipMark(1),
		createInsertMark(1, brand(1), { changes: TestChange.mint([], 2) }),
	],
	remove: createRemoveChangeset(1, 3),
	revive: createReviveChangeset(2, 2, { revision: tag, localId: brand(0) }),
	pin: [createPinMark(4, brand(0))],
	move: createMoveChangeset(1, 2, 4),
	return: createReturnChangeset(1, 3, 0, { revision: tag, localId: brand(0) }),
	transient_insert: [
		{ count: 1 },
		createAttachAndDetachMark(createInsertMark(2, brand(1)), createRemoveMark(2, brand(2))),
	],
};

function createInsertChangeset(
	index: number,
	count: number,
	id?: ChangesetLocalId,
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.insert(index, count, id ?? brand(0));
}

function createRemoveChangeset(
	startIndex: number,
	size: number,
	id?: ChangesetLocalId,
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.remove(startIndex, size, id ?? brand(0));
}

function createRedundantRemoveChangeset(
	index: number,
	size: number,
	detachEvent: ChangeAtomId,
): SF.Changeset<never> {
	const changeset = createRemoveChangeset(index, size);
	changeset[changeset.length - 1].cellId = detachEvent;
	return changeset;
}

function createRedundantReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
): SF.Changeset<never> {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachEvent);
	const mark = markList[markList.length - 1];
	delete mark.cellId;
	return markList;
}

function createReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.revive(startIndex, count, detachEvent);
}

function createMoveChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	id: ChangesetLocalId = brand(0),
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.move(sourceIndex, count, destIndex, id);
}

function createReturnChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	detachEvent: SF.CellId,
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.return(sourceIndex, count, destIndex, detachEvent);
}

function createModifyChangeset<TNodeChange>(
	index: number,
	change: TNodeChange,
): SF.Changeset<TNodeChange> {
	return SF.sequenceFieldEditor.buildChildChange(index, change);
}

function createModifyDetachedChangeset<TNodeChange>(
	index: number,
	change: TNodeChange,
	detachEvent: SF.CellId,
): SF.Changeset<TNodeChange> {
	const changeset = createModifyChangeset(index, change);
	const modify = changeset[changeset.length - 1] as SF.CellMark<SF.NoopMark, TNodeChange>;
	modify.cellId = detachEvent;
	return changeset;
}

/**
 * @param count - The number of nodes inserted.
 * @param cellId - The first cell to insert the content into (potentially includes lineage information).
 * Also defines the ChangeAtomId to associate with the mark.
 * @param overrides - Any additional properties to add to the mark.
 */
function createInsertMark<TChange = never>(
	count: number,
	cellId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Insert, TChange>>,
): SF.CellMark<SF.Insert, TChange> {
	const cellIdObject: SF.CellId = typeof cellId === "object" ? cellId : { localId: cellId };
	const mark: SF.CellMark<SF.Insert, TChange> = {
		type: "Insert",
		count,
		id: cellIdObject.localId,
		cellId: cellIdObject,
	};
	if (cellIdObject.revision !== undefined) {
		mark.revision = cellIdObject.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * This overload creates a revive that targets empty cells.
 * See `createPinMark` for a revive that targets populated cells.
 * @param count - The number of nodes to revive.
 * If a number is passed, that many dummy nodes will be generated.
 * @param cellId - The first cell to revive content into.
 * The mark id defaults to the local ID of this CellId.
 * @param overrides - Any additional properties to add to the mark.
 * Use this to give the mark a `RevisionTag`
 */
function createReviveMark<TChange = never>(
	count: number,
	cellId: SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Insert, TChange>>,
): SF.CellMark<SF.Insert, TChange> {
	return {
		type: "Insert",
		count,
		cellId,
		id: cellId.localId,
		...overrides,
	};
}

function createPinMark<TChange = never>(
	count: number,
	id: SF.MoveId,
	overrides?: Partial<SF.CellMark<SF.Insert, TChange>>,
): SF.CellMark<SF.Insert, TChange> {
	return {
		type: "Insert",
		count,
		id,
		...overrides,
	};
}

/**
 * @param count - The number of nodes to remove.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createRemoveMark<TChange = never>(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<SF.Remove, TChange>>,
): SF.CellMark<SF.Remove, TChange> {
	const cellId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.CellMark<SF.Remove, TChange> = {
		type: "Remove",
		count,
		id: cellId.localId,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to move.
 * @param markId - The id to associate with the marks.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 * @returns A pair of marks, the first for moving out, the second for moving in.
 */
function createMoveMarks<TChange = never>(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<(SF.MoveOut & SF.MoveIn) | { changes?: TChange }, TChange>>,
): [moveOut: SF.CellMark<SF.MoveOut, TChange>, moveIn: SF.CellMark<SF.MoveIn, never>] {
	const moveOut = createMoveOutMark(count, markId, overrides);
	const { changes: _, ...overridesWithNoChanges } = overrides ?? {};
	const moveIn = createMoveInMark(count, markId, overridesWithNoChanges);
	return [moveOut, moveIn];
}

/**
 * @param count - The number of nodes to move out.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createMoveOutMark<TChange = never>(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<SF.MoveOut, TChange>>,
): SF.CellMark<SF.MoveOut, TChange> {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.CellMark<SF.MoveOut, TChange> = {
		type: "MoveOut",
		count,
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		mark.revision = atomId.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes moved in.
 * @param cellId - The first cell to move the content into (potentially includes lineage information).
 * Also defines the ChangeAtomId to associate with the mark.
 * @param overrides - Any additional properties to add to the mark.
 */
function createMoveInMark(
	count: number,
	cellId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.MoveIn, never>>,
): SF.CellMark<SF.MoveIn, never> {
	const cellIdObject: SF.CellId = typeof cellId === "object" ? cellId : { localId: cellId };
	const mark: SF.CellMark<SF.MoveIn, never> = {
		type: "MoveIn",
		id: cellIdObject.localId,
		cellId: cellIdObject,
		count,
	};
	if (cellIdObject.revision !== undefined) {
		mark.revision = cellIdObject.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to attach.
 * @param markId - The id to associate with the mark.
 * @param cellId - The cell to return the nodes to.
 * If undefined, the mark targets populated cells and is therefore muted.
 * @param overrides - Any additional properties to add to the mark.
 */
function createReturnToMark(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	cellId?: SF.CellId,
	overrides?: Partial<SF.CellMark<SF.MoveIn, never>>,
): SF.CellMark<SF.MoveIn, never> {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.CellMark<SF.MoveIn, never> = {
		type: "MoveIn",
		id: atomId.localId,
		count,
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	if (atomId.revision !== undefined) {
		mark.revision = atomId.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param changes - The changes to apply to the node.
 * @param cellId - Describes the cell that the target node used to reside in. Used when the target node is removed.
 */
function createModifyMark<TChange>(
	changes: TChange,
	cellId?: SF.CellId,
): SF.CellMark<SF.NoopMark, TChange> {
	const mark: SF.CellMark<SF.NoopMark, TChange> = {
		count: 1,
		changes,
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function createSkipMark(count: number): SF.CellMark<SF.NoopMark, never> {
	return { count };
}

function createTomb(
	revision: RevisionTag | undefined,
	localId: ChangesetLocalId = brand(0),
	count: number = 1,
): SF.CellMark<SF.NoopMark, never> {
	return { count, cellId: { revision, localId } };
}

function createAttachAndDetachMark<TChange>(
	attach: SF.CellMark<SF.Attach, TChange>,
	detach: SF.CellMark<SF.Detach, TChange>,
	overrides?: Partial<SF.CellMark<SF.AttachAndDetach, TChange>>,
): SF.CellMark<SF.AttachAndDetach, TChange> {
	assert(attach.count === detach.count, "Attach and detach must have the same count");
	assert(attach.cellId !== undefined, "AttachAndDetach attach should apply to an empty cell");
	assert(detach.cellId === undefined, "AttachAndDetach detach should apply to an populated cell");
	assert(
		attach.changes === undefined && detach.changes === undefined,
		"Attach and detach must not carry changes",
	);
	// As a matter of normalization, we only use AttachAndDetach marks to represent cases where the detach's
	// implicit revival semantics would not be a sufficient representation.
	assert(attach.type === "MoveIn" || isNewAttach(attach), "Unnecessary AttachAndDetach mark");
	const mark: SF.CellMark<SF.AttachAndDetach, TChange> = {
		type: "AttachAndDetach",
		count: attach.count,
		cellId: attach.cellId,
		attach: SF.extractMarkEffect(attach),
		detach: SF.extractMarkEffect(detach),
		...overrides,
	};
	return mark;
}

function overrideCellId<TMark extends SF.HasMarkFields<unknown>>(
	cellId: SF.CellId,
	mark: TMark,
): TMark {
	mark.cellId = cellId;
	return mark;
}

export const MarkMaker = {
	onEmptyCell: overrideCellId,
	insert: createInsertMark,
	revive: createReviveMark,
	skip: createSkipMark,
	tomb: createTomb,
	pin: createPinMark,
	remove: createRemoveMark,
	modify: createModifyMark,
	move: createMoveMarks,
	moveOut: createMoveOutMark,
	moveIn: createMoveInMark,
	returnTo: createReturnToMark,
	attachAndDetach: createAttachAndDetachMark,
};

export const ChangeMaker = {
	insert: createInsertChangeset,
	remove: createRemoveChangeset,
	redundantRemove: createRedundantRemoveChangeset,
	revive: createReviveChangeset,
	redundantRevive: createRedundantReviveChangeset,
	move: createMoveChangeset,
	return: createReturnChangeset,
	modify: createModifyChangeset,
	modifyDetached: createModifyDetachedChangeset,
};
