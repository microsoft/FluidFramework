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
import { mintRevisionTag, RevisionTag, TreeSchemaIdentifier } from "../../../core";
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
	const content = [];
	while (content.length < size) {
		content.push({ type, value: startingValue + content.length });
	}
	return SF.sequenceFieldEditor.insert(
		index,
		content.map(singleTextCursor),
		id ?? brand(startingValue),
	);
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
