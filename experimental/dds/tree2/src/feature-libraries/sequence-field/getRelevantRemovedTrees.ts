/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset } from "./format";

export function getRelevantRemovedTrees(changeset: Changeset): Delta.DetachedNodeId[] {
	const nodes: Delta.DetachedNodeId[] = [];
	for (const mark of changeset) {
		if (mark.cellId !== undefined) {
			if (mark.type === "Insert") {
				// This tree is being restored by this change, so it is a relevant removed tree.
				nodes.push(nodeIdFromChangeAtom(mark.cellId));
			} else if (mark.type !== "MoveIn" && mark.changes !== undefined) {
				// This tree removed is being edited by this change, so it is a relevant removed tree.
				nodes.push(nodeIdFromChangeAtom(mark.cellId));
			}
		}
	}
	return nodes;
}
