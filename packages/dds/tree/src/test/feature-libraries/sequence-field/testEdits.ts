/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { type NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
import { type Mutable, brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
	asChangeAtomId,
	offsetChangeAtomId,
} from "../../../core/index.js";

const tag: RevisionTag = mintRevisionTag();

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

export const cases: {
	no_change: SF.Changeset;
	insert: SF.Changeset;
	modify: SF.Changeset;
	modify_insert: SF.Changeset;
	remove: SF.Changeset;
	revive: SF.Changeset;
	pin: SF.Changeset;
	rename: SF.Changeset;
	move: SF.Changeset;
	moveAndRemove: SF.Changeset;
	return: SF.Changeset;
	transient_insert: SF.Changeset;
} = {
	no_change: [],
	insert: createInsertChangeset(1, 2, undefined /* revision */, { localId: brand(1) }),
	modify: SF.sequenceFieldEditor.buildChildChanges([
		[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
	]),
	modify_insert: [
		createSkipMark(1),
		createInsertMark(1, brand(1), {
			changes: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
		}),
	],
	remove: createRemoveChangeset(1, 3, undefined /* revision */),
	revive: createReviveChangeset(
		2,
		2,
		{ revision: tag, localId: brand(0) },
		undefined /* revision */,
	),
	pin: [createPinMark(4, brand(0))],
	rename: [createRenameMark(3, brand(2), brand(3))],
	move: createMoveChangeset(1, 2, 4, undefined /* revision */),
	moveAndRemove: [
		createMoveOutMark(1, brand(0)),
		createAttachAndDetachMark(createMoveInMark(1, brand(0)), createRemoveMark(1, brand(1))),
	],
	return: createReturnChangeset(
		1,
		3,
		0,
		{ revision: tag, localId: brand(1) },
		{ revision: tag, localId: brand(0) },
		undefined /* revision */,
	),
	transient_insert: [
		{ count: 1 },
		createRemoveMark(2, brand(2), { cellId: { localId: brand(1) } }),
	],
};

function createInsertChangeset(
	index: number,
	count: number,
	revision: RevisionTag | undefined,
	firstId?: ChangeAtomId,
): SF.Changeset {
	return SF.sequenceFieldEditor.insert(
		index,
		count,
		firstId ?? { localId: brand(0), revision },
		revision,
	);
}

function createRemoveChangeset(
	startIndex: number,
	size: number,
	revision: RevisionTag | undefined,
	id?: ChangesetLocalId,
): SF.Changeset {
	return SF.sequenceFieldEditor.remove(startIndex, size, id ?? brand(0), revision);
}

function createRedundantRemoveChangeset(
	index: number,
	size: number,
	detachEvent: ChangeAtomId,
	revision: RevisionTag,
): SF.Changeset {
	const changeset = createRemoveChangeset(index, size, revision, detachEvent.localId);
	changeset[changeset.length - 1].cellId = detachEvent;
	return changeset;
}

function createPinChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	revision: RevisionTag | undefined,
): SF.Changeset {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachEvent, revision);
	const mark = markList[markList.length - 1];
	delete mark.cellId;
	return markList;
}

function createReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	revision: RevisionTag | undefined,
): SF.Changeset {
	return SF.sequenceFieldEditor.revive(startIndex, count, detachEvent, revision);
}

function createMoveChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId = brand(0),
): SF.Changeset {
	return SF.sequenceFieldEditor.move(
		sourceIndex,
		count,
		destIndex,
		id,
		{ localId: brand(id + count), revision },
		revision,
	);
}

function createReturnChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	detachCellId: SF.CellId,
	attachCellId: SF.CellId,
	revision: RevisionTag | undefined,
): SF.Changeset {
	return SF.sequenceFieldEditor.return(
		sourceIndex,
		count,
		destIndex,
		detachCellId,
		attachCellId,
		revision,
	);
}

function createModifyChangeset(index: number, change: NodeId): SF.Changeset {
	return SF.sequenceFieldEditor.buildChildChanges([[index, change]]);
}

function createModifyDetachedChangeset(
	index: number,
	change: NodeId,
	detachEvent: SF.CellId,
): SF.Changeset {
	const changeset = createModifyChangeset(index, change);
	const modify = changeset[changeset.length - 1] as SF.CellMark<SF.NoopMark>;
	modify.cellId = detachEvent;
	return changeset;
}

/**
 * @param count - The number of nodes inserted.
 * @param cellId - The first cell to insert the content into.
 * Also defines the ChangeAtomId to associate with the mark.
 * @param overrides - Any additional properties to add to the mark.
 */
function createInsertMark(
	count: number,
	cellId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Insert>>,
): SF.CellMark<SF.Insert> {
	const cellIdObject: SF.CellId = typeof cellId === "object" ? cellId : { localId: cellId };
	const mark: SF.CellMark<SF.Insert> = {
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
function createReviveMark(
	count: number,
	cellId: SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Insert>>,
): SF.CellMark<SF.Insert> {
	return {
		type: "Insert",
		count,
		cellId,
		id: cellId.localId,
		...overrides,
	};
}

function createPinMark(
	count: number,
	id: SF.MoveId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Insert>>,
): SF.CellMark<SF.Insert> {
	const cellIdObject: SF.CellId = typeof id === "object" ? id : { localId: id };
	const mark: SF.CellMark<SF.Insert> = {
		type: "Insert",
		count,
		id: cellIdObject.localId,
	};
	if (cellIdObject.revision !== undefined) {
		mark.revision = cellIdObject.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to remove.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createRemoveMark(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<SF.Remove>>,
): SF.CellMark<SF.Remove> {
	const cellId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.CellMark<SF.Remove> = {
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
 * @param count - The number of nodes to rename.
 * @param inputCellId - The ID associated with the first cell in the input context.
 * @param outputId - The ID to assign to the first cell in the output context.
 * @param overrides - Any additional properties to add to the mark.
 */
function createRenameMark(
	count: number,
	inputCellId: ChangesetLocalId | SF.CellId,
	outputCellId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.Rename>>,
): SF.CellMark<SF.Rename> {
	const cellId: ChangeAtomId =
		typeof inputCellId === "object" ? inputCellId : { localId: inputCellId };
	const outputId: ChangeAtomId =
		typeof outputCellId === "object" ? outputCellId : { localId: outputCellId };
	const mark: SF.CellMark<SF.Rename> = {
		type: "Rename",
		count,
		idOverride: outputId,
		cellId,
	};
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to move.
 * @param detachId - The id to associate with first emptied cell.
 * Defines how later edits refer the emptied cells.
 * The destination cells are assigned IDs with a `ChangesetLocalId` that is `count` greater.
 * @param overrides - Any additional properties to add to the mark.
 * @returns A pair of marks, the first for moving out, the second for moving in.
 */
function createMoveMarks(
	count: number,
	detachId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<(SF.MoveOut & SF.MoveIn) | { changes?: NodeId }>>,
): [moveOut: SF.CellMark<SF.MoveOut>, moveIn: SF.CellMark<SF.MoveIn>] {
	const moveOut = createMoveOutMark(count, detachId, overrides);
	const { changes: _, ...overridesWithNoChanges } = overrides ?? {};
	const moveIn = createMoveInMark(count, detachId, overridesWithNoChanges);
	return [moveOut, moveIn];
}

/**
 * @param count - The number of nodes to move out.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createMoveOutMark(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.CellMark<SF.MoveOut>>,
): SF.CellMark<SF.MoveOut> {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.CellMark<SF.MoveOut> = {
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
 * @param moveId - The ID associated with the first node being moved.
 * By default, the destination cell will be assigned an ID with a local ID that is equal to `moveId + count`.
 * @param overrides - Any additional properties to add to the mark.
 */
function createMoveInMark(
	count: number,
	moveId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.CellMark<SF.MoveIn>>,
): SF.CellMark<SF.MoveIn> {
	const moveIdObject = asChangeAtomId(moveId);
	const mark: SF.CellMark<SF.MoveIn> = {
		type: "MoveIn",
		id: moveIdObject.localId,
		cellId: offsetChangeAtomId(moveIdObject, count),
		count,
	};
	if (moveIdObject.revision !== undefined) {
		mark.revision = moveIdObject.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to attach.
 * @param moveId - The ID associated with the first node being moved.
 * @param cellId - The cell to return the nodes to.
 * If undefined, the mark targets populated cells and is therefore muted.
 * @param overrides - Any additional properties to add to the mark.
 */
function createReturnToMark(
	count: number,
	moveId: ChangesetLocalId | ChangeAtomId,
	cellId?: SF.CellId,
	overrides?: Partial<SF.CellMark<SF.MoveIn>>,
): SF.CellMark<SF.MoveIn> {
	const atomId = asChangeAtomId(moveId);
	const mark: SF.CellMark<SF.MoveIn> = {
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
function createModifyMark(changes: NodeId, cellId?: SF.CellId): SF.CellMark<SF.NoopMark> {
	const mark: SF.CellMark<SF.NoopMark> = {
		count: 1,
		changes,
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function createSkipMark(count: number): SF.CellMark<SF.NoopMark> {
	return { count };
}

function createTomb(
	revision: RevisionTag | undefined,
	localId: ChangesetLocalId = brand(0),
	count: number = 1,
): SF.CellMark<SF.NoopMark> {
	const cellId: Mutable<SF.CellId> = { localId };
	if (revision !== undefined) {
		cellId.revision = revision;
	}
	return { count, cellId };
}

function createAttachAndDetachMark(
	attach: SF.CellMark<SF.MoveIn>,
	detach: SF.CellMark<SF.Remove>,
	overrides?: Partial<SF.CellMark<SF.AttachAndDetach>>,
): SF.CellMark<SF.AttachAndDetach> {
	assert(attach.count === detach.count, "Attach and detach must have the same count");
	assert(attach.cellId !== undefined, "AttachAndDetach attach should apply to an empty cell");
	assert(
		detach.cellId === undefined,
		"AttachAndDetach detach should apply to an populated cell",
	);
	assert(
		attach.changes === undefined && detach.changes === undefined,
		"Attach and detach must not carry changes",
	);
	const mark: SF.CellMark<SF.AttachAndDetach> = {
		type: "AttachAndDetach",
		count: attach.count,
		cellId: attach.cellId,
		attach: SF.extractMarkEffect(attach),
		detach: SF.extractMarkEffect(detach),
		...overrides,
	};
	return mark;
}

function overrideCellId<TMark extends SF.HasMarkFields>(
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
	rename: createRenameMark,
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
	pin: createPinChangeset,
	move: createMoveChangeset,
	return: createReturnChangeset,
	modify: createModifyChangeset,
	modifyDetached: createModifyDetachedChangeset,
};
