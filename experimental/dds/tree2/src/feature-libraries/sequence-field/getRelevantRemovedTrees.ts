/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset } from "./format";
import { isMoveMark } from "./moveEffectTable";
import { isDetachMark, isInsert, isReattach } from "./utils";

export function* getRelevantRemovedTrees(changeset: Changeset): Iterable<Delta.DetachedNodeId> {
	for (const mark of changeset) {
		if (mark.cellId !== undefined) {
			if (isInsert(mark) && isReattach(mark)) {
				// This tree is being restored.
				yield nodeIdFromChangeAtom(mark.cellId);
			} else if (isDetachMark(mark)) {
				if (isMoveMark(mark)) {
					// This removed tree is being moved.
					yield nodeIdFromChangeAtom(mark.cellId);
				} else {
					// This removed tree is being deleted.
					// We currently don't reassign the ID for such a tree, so it isn't relevant.
				}
			} else if (mark.type !== "MoveIn" && mark.changes !== undefined) {
				// This removed tree is being edited.
				yield nodeIdFromChangeAtom(mark.cellId);
			}
		}
	}
}
