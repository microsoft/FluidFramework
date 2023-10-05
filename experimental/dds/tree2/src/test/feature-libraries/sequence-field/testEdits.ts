/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { brand } from "../../../util";
import { fakeTaggedRepair as fakeRepair } from "../../utils";
import {
	ChangeAtomId,
	ChangesetLocalId,
	ITreeCursorSynchronous,
	JsonableTree,
	mintRevisionTag,
	RevisionTag,
	TreeSchemaIdentifier,
} from "../../../core";
import { TestChange } from "../../testChange";
import { composeAnonChanges, composeAnonChangesShallow } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const tag: RevisionTag = mintRevisionTag();

export type TestChangeset = SF.Changeset<TestChange>;

export const cases: {
	no_change: TestChangeset;
	insert: TestChangeset;
	modify: TestChangeset;
	modify_insert: TestChangeset;
	delete: TestChangeset;
	revive: TestChangeset;
	move: TestChangeset;
	return: TestChangeset;
} = {
	no_change: [],
	insert: createInsertChangeset(1, 2, 1),
	modify: SF.sequenceFieldEditor.buildChildChange(0, TestChange.mint([], 1)),
	modify_insert: composeAnonChanges([
		createInsertChangeset(1, 1, 1),
		createModifyChangeset(1, TestChange.mint([], 2)),
	]),
	delete: createDeleteChangeset(1, 3),
	revive: createReviveChangeset(2, 2, { revision: tag, localId: brand(0) }),
	move: createMoveChangeset(1, 2, 2),
	return: createReturnChangeset(1, 3, 0, { revision: tag, localId: brand(0) }),
};

function createInsertChangeset(
	index: number,
	size: number,
	startingValue: number = 0,
	id?: ChangesetLocalId,
): SF.Changeset<never> {
	const content = generateJsonables(size, startingValue);
	return SF.sequenceFieldEditor.insert(
		index,
		content.map(singleTextCursor),
		id ?? brand(startingValue),
	);
}

function generateJsonables(size: number, startingValue: number = 0) {
	const content = [];
	while (content.length < size) {
		content.push({ type, value: startingValue + content.length });
	}
	return content;
}

function createDeleteChangeset(
	startIndex: number,
	size: number,
	id?: ChangesetLocalId,
): SF.Changeset<never> {
	return SF.sequenceFieldEditor.delete(startIndex, size, id ?? brand(0));
}

function createRedundantRemoveChangeset(
	index: number,
	size: number,
	detachEvent: ChangeAtomId,
): SF.Changeset<never> {
	const changeset = createDeleteChangeset(index, size);
	(changeset[changeset.length - 1] as SF.Delete).cellId = detachEvent;
	return changeset;
}

function createReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	reviver = fakeRepair,
	lastDetach?: SF.CellId,
): SF.Changeset<never> {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachEvent, reviver);
	const mark = markList[markList.length - 1] as SF.Reattach;
	if (lastDetach !== undefined) {
		mark.cellId = lastDetach;
	}
	return markList;
}

function createRedundantReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	reviver = fakeRepair,
	isIntention?: boolean,
): SF.Changeset<never> {
	const markList = SF.sequenceFieldEditor.revive(
		startIndex,
		count,
		detachEvent,
		reviver,
		isIntention,
	);
	const mark = markList[markList.length - 1] as SF.Reattach;
	delete mark.cellId;
	return markList;
}

function createBlockedReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	lastDetach: SF.CellId,
	reviver = fakeRepair,
): SF.Changeset<never> {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachEvent, reviver);
	const mark = markList[markList.length - 1] as SF.Reattach;
	mark.cellId = lastDetach;
	return markList;
}

function createIntentionalReviveChangeset(
	startIndex: number,
	count: number,
	detachEvent: SF.CellId,
	reviver = fakeRepair,
	lastDetach?: SF.CellId,
): SF.Changeset<never> {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachEvent, reviver, true);
	const mark = markList[markList.length - 1] as SF.Reattach;

	if (lastDetach !== undefined) {
		mark.cellId = lastDetach;
	}

	return markList;
}

function createMoveChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	id: ChangesetLocalId = brand(0),
): SF.Changeset<never> {
	return composeAnonChangesShallow(
		SF.sequenceFieldEditor.move(sourceIndex, count, destIndex, id),
	);
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
	const modify = changeset[changeset.length - 1] as SF.NoopMark<TNodeChange>;
	modify.cellId = detachEvent;
	return changeset;
}

/**
 * @param countOrContent - The content to insert.
 * If a number is passed, that many dummy nodes will be generated.
 * @param cellId - The first cell to insert the content into (potentially includes lineage information).
 * Also defines the ChangeAtomId to associate with the mark.
 * @param overrides - Any additional properties to add to the mark.
 */
function createInsertMark<TChange = never>(
	countOrContent: number | JsonableTree[],
	cellId: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.Insert<TChange>>,
): SF.Insert<TChange> {
	const content = Array.isArray(countOrContent)
		? countOrContent
		: generateJsonables(countOrContent);
	const cellIdObject: SF.CellId = typeof cellId === "object" ? cellId : { localId: cellId };
	const mark: SF.Insert<TChange> = {
		type: "Insert",
		content,
		count: content.length,
		cellId: cellIdObject,
	};
	if (cellIdObject.revision !== undefined) {
		mark.revision = cellIdObject.revision;
	}
	return { ...mark, ...overrides };
}

/**
 * @param countOrContent - The content to revive.
 * If a number is passed, that many dummy nodes will be generated.
 * @param cellId - The first cell to revive content into.
 * If undefined, the revive targets populated cells and is therefore muted.
 * @param overrides - Any additional properties to add to the mark.
 * Use this to give the mark a `RevisionTag`
 */
function createReviveMark<TChange = never>(
	countOrContent: number | ITreeCursorSynchronous[],
	cellId?: SF.CellId,
	overrides?: Partial<SF.Revive<TChange>>,
): SF.Revive<TChange> {
	const content = Array.isArray(countOrContent)
		? countOrContent
		: generateJsonables(countOrContent).map(singleTextCursor);
	const mark: SF.Revive<TChange> = {
		type: "Revive",
		count: content.length,
		content,
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return { ...mark, ...overrides };
}

/**
 * @param count - The number of nodes to delete.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createDeleteMark<TChange = never>(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.Delete<TChange>>,
): SF.Delete<TChange> {
	const cellId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.Delete<TChange> = {
		type: "Delete",
		count,
		id: cellId.localId,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	return { ...mark, ...overrides };
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
	overrides?: Partial<SF.MoveOut<TChange>>,
): SF.MoveOut<TChange> {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.MoveOut<TChange> = {
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
	overrides?: Partial<SF.MoveIn>,
): SF.MoveIn {
	const cellIdObject: SF.CellId = typeof cellId === "object" ? cellId : { localId: cellId };
	const mark: SF.MoveIn = {
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
 * @param count - The number of nodes to be detached.
 * @param markId - The id to associate with the mark.
 * Defines how later edits refer the emptied cells.
 * @param overrides - Any additional properties to add to the mark.
 */
function createReturnFromMark<TChange = never>(
	count: number,
	markId: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.ReturnFrom<TChange>>,
): SF.ReturnFrom<TChange> {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.ReturnFrom<TChange> = {
		type: "ReturnFrom",
		count,
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		mark.revision = atomId.revision;
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
	overrides?: Partial<SF.ReturnTo>,
): SF.ReturnTo {
	const atomId: ChangeAtomId = typeof markId === "object" ? markId : { localId: markId };
	const mark: SF.ReturnTo = {
		type: "ReturnTo",
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
function createModifyMark<TChange>(changes: TChange, cellId?: SF.CellId): SF.NoopMark<TChange> {
	const mark: SF.NoopMark<TChange> = {
		count: 1,
		changes,
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
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
	delete: createDeleteMark,
	modify: createModifyMark,
	moveOut: createMoveOutMark,
	moveIn: createMoveInMark,
	returnFrom: createReturnFromMark,
	returnTo: createReturnToMark,
};

export const ChangeMaker = {
	insert: createInsertChangeset,
	delete: createDeleteChangeset,
	redundantRemove: createRedundantRemoveChangeset,
	revive: createReviveChangeset,
	intentionalRevive: createIntentionalReviveChangeset,
	redundantRevive: createRedundantReviveChangeset,
	blockedRevive: createBlockedReviveChangeset,
	move: createMoveChangeset,
	return: createReturnChangeset,
	modify: createModifyChangeset,
	modifyDetached: createModifyDetachedChangeset,
};
