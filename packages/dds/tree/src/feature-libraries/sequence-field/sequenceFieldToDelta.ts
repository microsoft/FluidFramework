/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { singleTextCursor } from "../treeTextCursor";
import { NodeReviver } from "../modular-schema";
import { MarkList, ProtoNode } from "./format";
import { getInputLength, isSkipMark } from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange, index: number | undefined) => Delta.Modify;

const ERR_NO_REVISION_ON_REVIVE =
	"Unable to get convert revive mark to delta due to missing revision tag";

export function sequenceFieldToDelta<TNodeChange>(
	marks: MarkList<TNodeChange>,
	deltaFromChild: ToDelta<TNodeChange>,
	reviver: NodeReviver,
): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	let inputIndex = 0;
	for (const mark of marks) {
		if (isSkipMark(mark)) {
			out.pushOffset(mark);
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case "Insert": {
					const insertMark: Delta.Mark = makeDeltaInsert(
						mark.content,
						mark.changes,
						deltaFromChild,
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
					const modify = deltaFromChild(mark.changes, inputIndex);
					if (modify.setValue !== undefined || modify.fields !== undefined) {
						out.pushContent(modify);
					} else {
						out.pushOffset(1);
					}
					break;
				}
				case "Delete": {
					const deleteMark: Delta.Delete = {
						type: Delta.MarkType.Delete,
						count: mark.count,
					};
					out.pushContent(deleteMark);
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const moveMark: Delta.MoveOut = {
						type: Delta.MarkType.MoveOut,
						moveId: brandOpaque<Delta.MoveId>(mark.id),
						count: mark.count,
					};
					out.pushContent(moveMark);
					break;
				}
				case "Revive": {
					if (mark.conflictsWith === undefined) {
						const insertMark: Delta.Insert = {
							type: Delta.MarkType.Insert,
							content: reviver(
								mark.detachedBy ??
									mark.lastDetachedBy ??
									fail(ERR_NO_REVISION_ON_REVIVE),
								mark.detachIndex,
								mark.count,
							),
						};
						out.pushContent(insertMark);
					} else if (mark.lastDetachedBy === undefined) {
						out.pushOffset(mark.count);
					}
					break;
				}
				default:
					unreachableCase(type);
			}
		}
		inputIndex += getInputLength(mark);
	}
	return out.list;
}

/**
 * Converts inserted content into the format expected in Delta instances.
 * This involves applying all except MoveIn changes.
 *
 * The returned `fields` map may be empty if all modifications are applied by the function.
 */
function makeDeltaInsert<TNodeChange>(
	content: ProtoNode[],
	changes: TNodeChange | undefined,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.Insert | Delta.InsertAndModify {
	// TODO: consider processing modifications at the same time as cloning to avoid unnecessary cloning
	const cursors = content.map(singleTextCursor);
	if (changes !== undefined) {
		const outModifications = deltaFromChild(changes, undefined);
		return {
			...outModifications,
			type: Delta.MarkType.InsertAndModify,
			content: cursors[0],
		};
	} else {
		return { type: Delta.MarkType.Insert, content: cursors };
	}
}
