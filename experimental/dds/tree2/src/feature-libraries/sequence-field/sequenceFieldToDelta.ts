/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, Mutable, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { singleTextCursor } from "../treeTextCursor";
import { Mark, MarkList, NoopMarkType } from "./format";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getEffectiveNodeChanges,
	markIsTransient,
} from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.Modify;

export function sequenceFieldToDelta<TNodeChange>(
	marks: MarkList<TNodeChange>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.MarkList {
	const out = new OffsetListFactory<Delta.Mark>();
	for (const mark of marks) {
		const changes = getEffectiveNodeChanges(mark);
		const cellDelta = cellDeltaFromMark(mark, changes === undefined);
		const fullDelta = withChildModificationsIfAny(changes, cellDelta, deltaFromChild);
		out.push(fullDelta);
	}
	return out.list;
}

function cellDeltaFromMark<TNodeChange>(
	mark: Mark<TNodeChange>,
	ignoreTransient: boolean,
): Mutable<Delta.Mark> {
	if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
		// Since each cell is associated with exactly one node,
		// the cell starting end ending populated means the cell content has not changed.
		return mark.count;
	} else if (
		areInputCellsEmpty(mark) &&
		areOutputCellsEmpty(mark) &&
		(!markIsTransient(mark) || ignoreTransient)
	) {
		// The cell starting and ending empty means the cell content has not changed,
		// unless transient content was inserted/attached.
		return 0;
	} else {
		const type = mark.type;
		// Inline into `switch(mark.type)` once we upgrade to TS 4.7
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
				return insertMark;
			}
			case "MoveIn":
			case "ReturnTo": {
				return {
					type: Delta.MarkType.MoveIn,
					count: mark.count,
					moveId: brandOpaque<Delta.MoveId>(mark.id),
				};
			}
			case NoopMarkType: {
				return mark.count;
			}
			case "Delete": {
				return {
					type: Delta.MarkType.Delete,
					count: mark.count,
				};
			}
			case "MoveOut":
			case "ReturnFrom": {
				return {
					type: Delta.MarkType.MoveOut,
					moveId: brandOpaque<Delta.MoveId>(mark.id),
					count: mark.count,
				};
			}
			case "Revive": {
				const insertMark: Mutable<Delta.Insert> = {
					type: Delta.MarkType.Insert,
					content: mark.content,
				};
				if (mark.transientDetach !== undefined) {
					insertMark.isTransient = true;
				}
				return insertMark;
			}
			case "Placeholder":
				fail("Should not have placeholders in a changeset being converted to delta");
			default:
				unreachableCase(type);
		}
	}
}

function withChildModificationsIfAny<TNodeChange>(
	changes: TNodeChange | undefined,
	deltaMark: Mutable<Delta.Mark>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.Mark {
	if (changes !== undefined) {
		const modify = deltaFromChild(changes);
		if (modify.fields !== undefined) {
			if (typeof deltaMark === "number") {
				assert(deltaMark === 1, "Invalid nested changes on non-1 skip mark");
				return modify;
			} else {
				assert(
					deltaMark.type !== Delta.MarkType.MoveIn,
					"Invalid nested changes on MoveIn mark",
				);
				return { ...deltaMark, fields: modify.fields };
			}
		}
	}
	return deltaMark;
}
