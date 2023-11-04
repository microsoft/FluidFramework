/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, offsetDetachId } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset } from "./format";
import { isMoveMark } from "./moveEffectTable";
import { isDetach, isInsert, isNewAttach, isReattach } from "./utils";

export type RemovedTreesFromTChild<TChild> = (child: TChild) => Iterable<Delta.DetachedNodeId>;

export function* relevantRemovedTrees<TChild>(
	changeset: Changeset<TChild>,
	removedTreesFromChild: RemovedTreesFromTChild<TChild>,
): Iterable<Delta.DetachedNodeId> {
	for (const mark of changeset) {
		if (mark.cellId !== undefined) {
			let includeNodesFromMark = false;
			if (isInsert(mark) && isReattach(mark)) {
				// This tree is being restored.
				includeNodesFromMark = true;
			} else if (isDetach(mark)) {
				if (isMoveMark(mark)) {
					// This removed tree is being moved.
					includeNodesFromMark = true;
				} else {
					// This removed tree is being deleted.
					// We currently don't reassign the ID for such a tree, so it isn't relevant.
				}
			}
			if (mark.type !== "MoveIn" && !isNewAttach(mark) && mark.changes !== undefined) {
				// This removed tree is being edited.
				includeNodesFromMark = true;
			}
			if (includeNodesFromMark) {
				const nodeId = nodeIdFromChangeAtom(mark.cellId);
				for (let i = 0; i < mark.count; i += 1) {
					yield offsetDetachId(nodeId, i);
				}
			}
		}
		if (mark.type !== "MoveIn" && mark.changes !== undefined) {
			yield* removedTreesFromChild(mark.changes);
		}
	}
}
