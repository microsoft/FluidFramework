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
	(changeset[changeset.length - 1] as SF.DeleteMark<never>).cellId = detachEvent;
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
	const mark = markList[markList.length - 1] as SF.ReattachMark<never>;
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
	const mark = markList[markList.length - 1] as SF.ReattachMark<never>;
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
	const mark = markList[markList.length - 1] as SF.ReattachMark<never>;
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
	const mark = markList[markList.length - 1] as SF.ReattachMark<never>;

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
	const modify = changeset[changeset.length - 1] as SF.ModifyMark<TNodeChange>;
	modify.cellId = detachEvent;
	return changeset;
}

export function createInsertMark<TChange = never>(
	countOrContent: number | JsonableTree[],
	id: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.Insert<TChange>>,
): SF.InsertMark<TChange> {
	const content = Array.isArray(countOrContent)
		? countOrContent
		: generateJsonables(countOrContent);
	const cellId: SF.CellId = typeof id === "object" ? id : { localId: id };
	const effect: SF.Insert<TChange> = {
		type: "Insert",
		content,
	};
	if (cellId.revision !== undefined) {
		effect.revision = cellId.revision;
	}
	const mark: SF.InsertMark<TChange> = {
		count: content.length,
		cellId,
		effect: [{ ...effect, ...overrides }],
	};
	return mark;
}

export function createReviveMark<TChange = never>(
	countOrContent: number | ITreeCursorSynchronous[],
	cellId?: SF.CellId,
	overrides?: Partial<SF.Revive<TChange>>,
): SF.ReviveMark<TChange> {
	const content = Array.isArray(countOrContent)
		? countOrContent
		: generateJsonables(countOrContent).map(singleTextCursor);
	const effect: SF.Revive<TChange> = {
		type: "Revive",
		content,
		...overrides,
	};
	const mark: SF.ReviveMark<TChange> = {
		count: content.length,
		effect: [effect],
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

export function createDeleteMark<TChange = never>(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.Delete<TChange>>,
): SF.DeleteMark<TChange> {
	const atomId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const effect: SF.Delete<TChange> = {
		type: "Delete",
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		effect.revision = atomId.revision;
	}
	const mark: SF.DeleteMark<TChange> = {
		count,
		effect: [{ ...effect, ...overrides }],
	};
	return mark;
}

export function createMoveOutMark<TChange = never>(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.MoveOut<TChange>>,
): SF.MoveOutMark<TChange> {
	const atomId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const effect: SF.MoveOut<TChange> = {
		type: "MoveOut",
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		effect.revision = atomId.revision;
	}
	const mark: SF.MoveOutMark<TChange> = {
		count,
		effect: [{ ...effect, ...overrides }],
	};
	return mark;
}

export function createMoveInMark(
	count: number,
	id: ChangesetLocalId | SF.CellId,
	overrides?: Partial<SF.MoveIn>,
): SF.MoveInMark {
	const cellId: SF.CellId = typeof id === "object" ? id : { localId: id };
	const effect: SF.MoveIn = {
		type: "MoveIn",
		id: cellId.localId,
	};
	if (cellId.revision !== undefined) {
		effect.revision = cellId.revision;
	}
	const mark: SF.MoveInMark = {
		count,
		cellId,
		effect: [{ ...effect, ...overrides }],
	};
	return mark;
}

export function createReturnFromMark<TChange = never>(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	overrides?: Partial<SF.ReturnFrom<TChange>>,
): SF.ReturnFromMark<TChange> {
	const atomId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const effect: SF.ReturnFrom<TChange> = {
		type: "ReturnFrom",
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		effect.revision = atomId.revision;
	}
	const mark: SF.ReturnFromMark<TChange> = {
		count,
		effect: [{ ...effect, ...overrides }],
	};
	return mark;
}

export function createReturnToMark(
	count: number,
	id: ChangesetLocalId | ChangeAtomId,
	cellId?: SF.CellId,
	overrides?: Partial<SF.ReturnTo>,
): SF.ReturnToMark {
	const atomId: ChangeAtomId = typeof id === "object" ? id : { localId: id };
	const effect: SF.ReturnTo = {
		type: "ReturnTo",
		id: atomId.localId,
	};
	if (atomId.revision !== undefined) {
		effect.revision = atomId.revision;
	}
	const mark: SF.ReturnToMark = {
		count,
		effect: [{ ...effect, ...overrides }],
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

export function createModifyMark<TChange>(
	changes: TChange,
	cellId?: SF.CellId,
): SF.ModifyMark<TChange> {
	const mark: SF.ModifyMark<TChange> = {
		count: 1,
		effect: [
			{
				type: "Modify",
				changes,
			},
		],
	};
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function overrideCellId<TMark extends SF.Mark<any>>(id: SF.CellId, mark: TMark): TMark {
	mark.cellId = id;
	return mark;
}

export const MarkMaker = {
	onCell: overrideCellId,
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
