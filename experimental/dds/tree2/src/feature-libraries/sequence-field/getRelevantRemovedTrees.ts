/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset } from "./format";
import { isDetachMark, isInsert, isReattach } from "./utils";

export function getRelevantRemovedTrees(changeset: Changeset): Delta.DetachedNodeId[] {
	const nodes: Delta.DetachedNodeId[] = [];
	for (const mark of changeset) {
		if (mark.cellId !== undefined) {
			if (isInsert(mark) && isReattach(mark)) {
				// This tree is being restored.
				nodes.push(nodeIdFromChangeAtom(mark.cellId));
			} else if (isDetachMark(mark)) {
				// This removed tree is being moved.
				nodes.push(nodeIdFromChangeAtom(mark.cellId));
			} else if (mark.type !== "MoveIn" && mark.changes !== undefined) {
				// This removed tree is being edited.
				nodes.push(nodeIdFromChangeAtom(mark.cellId));
			}
		}
	}
	return nodes;
}
