/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, Mutable, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { populateChildModifications } from "../deltaUtils";
import { singleTextCursor } from "../treeTextCursor";
import { MarkList, NoopMarkType } from "./format";
import { areInputCellsEmpty, areOutputCellsEmpty, getMarkLength, getNodeChange } from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.Modify;

export function sequenceFieldToDelta<TNodeChange>(
	marks: MarkList<TNodeChange>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			out.push(deltaFromNodeChange(getNodeChange(mark), getMarkLength(mark), deltaFromChild));
		} else if (areInputCellsEmpty(mark) && areOutputCellsEmpty(mark)) {
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			assert(type !== NoopMarkType, 0x6b0 /* Cell changing mark must no be a NoopMark */);
			switch (type) {
				case "Insert": {
					const cursors = mark.content.map(singleTextCursor);
					const insertMark: Mutable<Delta.Insert> = {
						type: Delta.MarkType.Insert,
						content: cursors,
					};
					populateChildModificationsIfAny(mark.changes, insertMark, deltaFromChild);
					out.pushContent(insertMark);
					break;
				}
				case "MoveIn":
				case "ReturnTo": {
					const moveMark: Delta.MoveIn = {
						type: Delta.MarkType.MoveIn,
						count: mark.count,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
					};
					out.pushContent(moveMark);
					break;
				}
				case "Modify": {
					const modify = deltaFromChild(mark.changes);
					if (
						Object.prototype.hasOwnProperty.call(modify, "setValue") ||
						modify.fields !== undefined
					) {
						out.pushContent(modify);
					} else {
						out.pushOffset(1);
					}
					break;
				}
				case "Delete": {
					const deleteMark: Mutable<Delta.Delete> = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					populateChildModificationsIfAny(mark.changes, deleteMark, deltaFromChild);
					out.pushContent(deleteMark);
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const moveMark: Mutable<Delta.MoveOut> = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					populateChildModificationsIfAny(mark.changes, moveMark, deltaFromChild);
					out.pushContent(moveMark);
					break;
				}
				case "Revive": {
					const insertMark: Mutable<Delta.Insert> = {
						type: Delta.MarkType.Insert,
						content: mark.content,
					};
					populateChildModificationsIfAny(mark.changes, insertMark, deltaFromChild);
					out.pushContent(insertMark);
					break;
				}
				case "Placeholder":
					fail("Should not have placeholders in a changeset being converted to delta");
				default:
					unreachableCase(type);
			}
		}
	}
	return out.list;
}

function populateChildModificationsIfAny<TNodeChange>(
	changes: TNodeChange | undefined,
	deltaMark: Mutable<Delta.HasModifications>,
	deltaFromChild: ToDelta<TNodeChange>,
): void {
	if (changes !== undefined) {
		const modify = deltaFromChild(changes);
		populateChildModifications(modify, deltaMark);
	}
}

function deltaFromNodeChange<TNodeChange>(
	change: TNodeChange | undefined,
	length: number,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.Mark {
	if (change === undefined) {
		return length;
	}
	assert(length === 1, 0x6a3 /* Modifying mark must be length one */);
	const modify = deltaFromChild(change);
	return isEmptyModify(modify) ? 1 : modify;
}

function isEmptyModify(modify: Delta.Modify): boolean {
	return modify.fields === undefined && modify.setValue === undefined;
}
