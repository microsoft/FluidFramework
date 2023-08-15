/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, Mutable, OffsetListFactory } from "../../util";
import { Delta, RepairDataBuilder } from "../../core";
import { populateChildModifications } from "../deltaUtils";
import { singleTextCursor } from "../treeTextCursor";
import { IdAllocator } from "../modular-schema";
import { MarkList, NoopMarkType } from "./format";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getMarkLength,
	getNodeChange,
	markIsTransient,
} from "./utils";

export type ToDelta<TNodeChange> = (
	child: TNodeChange,
	repairDataBuilder: RepairDataBuilder,
	idAllocator: IdAllocator,
) => Delta.Modify;

export function sequenceFieldToDelta<TNodeChange>(
	marks: MarkList<TNodeChange>,
	deltaFromChild: ToDelta<TNodeChange>,
	repairDataBuilder: RepairDataBuilder,
	idAllocator: IdAllocator,
): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			out.push(
				deltaFromNodeChange(
					getNodeChange(mark),
					getMarkLength(mark),
					deltaFromChild,
					repairDataBuilder,
					idAllocator,
				),
			);
		} else if (
			areInputCellsEmpty(mark) &&
			areOutputCellsEmpty(mark) &&
			(!markIsTransient(mark) || mark.changes === undefined)
		) {
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
					if (mark.transientDetach !== undefined) {
						insertMark.isTransient = true;
					}
					populateChildModificationsIfAny(
						mark.changes,
						insertMark,
						deltaFromChild,
						repairDataBuilder,
						idAllocator,
					);
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
					const modify = deltaFromChild(mark.changes, repairDataBuilder, idAllocator);
					if (modify.fields !== undefined) {
						out.pushContent(modify);
					} else {
						out.pushOffset(1);
					}
					break;
				}
				case "Delete": {
					const detachedField = repairDataBuilder.handler({
						revision: mark.revision,
						localId: mark.id,
					});
					const moveId = brandOpaque<Delta.MoveId>(idAllocator());
					const moveMark: Mutable<Delta.MoveOut> = {
						type: Delta.MarkType.MoveOut,
						moveId,
						count: mark.count,
						isDelete: true,
					};
					populateChildModificationsIfAny(
						mark.changes,
						moveMark,
						deltaFromChild,
						repairDataBuilder,
						idAllocator,
					);
					out.pushContent(moveMark);
					repairDataBuilder.marks.set(detachedField, [
						{
							type: Delta.MarkType.MoveIn,
							count: mark.count,
							moveId,
							isDelete: true,
						},
					]);
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const moveMark: Mutable<Delta.MoveOut> = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					populateChildModificationsIfAny(
						mark.changes,
						moveMark,
						deltaFromChild,
						repairDataBuilder,
						idAllocator,
					);
					out.pushContent(moveMark);
					break;
				}
				case "Revive": {
					const insertMark: Mutable<Delta.Insert> = {
						type: Delta.MarkType.Insert,
						content: mark.content,
					};
					if (mark.transientDetach !== undefined) {
						insertMark.isTransient = true;
					}
					populateChildModificationsIfAny(
						mark.changes,
						insertMark,
						deltaFromChild,
						repairDataBuilder,
						idAllocator,
					);
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
	repairDataBuilder: RepairDataBuilder,
	idAllocator: IdAllocator,
): void {
	if (changes !== undefined) {
		const modify = deltaFromChild(changes, repairDataBuilder, idAllocator);
		populateChildModifications(modify, deltaMark);
	}
}

function deltaFromNodeChange<TNodeChange>(
	change: TNodeChange | undefined,
	length: number,
	deltaFromChild: ToDelta<TNodeChange>,
	repairDataBuilder: RepairDataBuilder,
	idAllocator: IdAllocator,
): Delta.Mark {
	if (change === undefined) {
		return length;
	}
	assert(length === 1, 0x6a3 /* Modifying mark must be length one */);
	const modify = deltaFromChild(change, repairDataBuilder, idAllocator);
	return isEmptyModify(modify) ? 1 : modify;
}

function isEmptyModify(modify: Delta.Modify): boolean {
	return modify.fields === undefined;
}
