/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangesetLocalId,
	SequenceField as SF,
	singleTextCursor,
} from "../../../feature-libraries";
import { brand } from "../../../util";
import { fakeTaggedRepair as fakeRepair } from "../../utils";
import {
	ITreeCursorSynchronous,
	JsonableTree,
	mintRevisionTag,
	RevisionTag,
	TreeSchemaIdentifier,
} from "../../../core";
import { TestChange } from "../../testChange";
// eslint-disable-next-line import/no-internal-modules
import { ChangeAtomId } from "../../../feature-libraries/modular-schema";
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
	const modify = changeset[changeset.length - 1] as SF.Modify;
	modify.cellId = detachEvent;
	return changeset;
}

export function createInsertMark<TChange = never>(
	countOrContent: number | JsonableTree[],
	id: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.Insert<TChange>>,
): SF.Insert<TChange> {
	const content = Array.isArray(countOrContent)
		? countOrContent
		: generateJsonables(countOrContent);
	const cellId: SF.CellId = typeof id === "object" ? id : { localId: id };
	const mark: SF.Insert<TChange> = {
		type: "Insert",
		content,
		id: cellId.localId,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	const withOverrides: SF.Insert<TChange> = {
		...mark,
		...overrides,
	};
	return withOverrides;
}

export function createReviveMark<TChange = never>(
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
	const withOverrides: SF.Revive<TChange> = {
		...mark,
		...overrides,
	};
	return withOverrides;
}

export function createDeleteMark<TChange = never>(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.Delete<TChange>>,
): SF.Delete<TChange> {
	const cellId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const mark: SF.Delete<TChange> = {
		type: "Delete",
		count,
		id: cellId.localId,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	const withOverrides: SF.Delete<TChange> = {
		...mark,
		...overrides,
	};
	return withOverrides;
}

export function createMoveOutMark<TChange = never>(
	count: number,
	id: ChangesetLocalId,
	overrides?: Partial<SF.MoveOut<TChange>>,
): SF.MoveOut<TChange> {
	const mark: SF.MoveOut<TChange> = {
		type: "MoveOut",
		count,
		id,
		...overrides,
	};
	return mark;
}

export function createMoveInMark(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.MoveIn>,
): SF.MoveIn {
	const cellId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const mark: SF.MoveIn = {
		type: "MoveIn",
		id: cellId.localId,
		count,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	const withOverrides: SF.MoveIn = {
		...mark,
		...overrides,
	};
	return withOverrides;
}

export function createReturnFromMark<TChange = never>(
	count: number,
	id: ChangesetLocalId,
	overrides?: Partial<SF.ReturnFrom<TChange>>,
): SF.ReturnFrom<TChange> {
	const mark: SF.ReturnFrom<TChange> = {
		type: "ReturnFrom",
		count,
		id,
		...overrides,
	};
	return mark;
}

export function createReturnToMark(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.ReturnTo>,
): SF.ReturnTo {
	const cellId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const mark: SF.ReturnTo = {
		type: "ReturnTo",
		id: cellId.localId,
		count,
	};
	if (cellId.revision !== undefined) {
		mark.revision = cellId.revision;
	}
	const withOverrides: SF.ReturnTo = {
		...mark,
		...overrides,
	};
	return withOverrides;
}

export function createModifyMark<TChange>(changes: TChange, id?: SF.CellId): SF.Modify<TChange> {
	const mark: SF.Modify<TChange> = {
		type: "Modify",
		changes,
	};
	if (id !== undefined) {
		mark.cellId = id;
	}
	return mark;
}

export const MarkMaker = {
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
