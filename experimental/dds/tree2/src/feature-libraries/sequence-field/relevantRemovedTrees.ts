/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Delta, offsetDetachId } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset, Mark } from "./format";
import { isMoveMark } from "./moveEffectTable";
import { isDetach, isInsert, isNewAttach, isReattachEffect, isTransientEffect } from "./utils";

export type RemovedTreesFromTChild<TChild> = (child: TChild) => Iterable<Delta.DetachedNodeId>;

export function* relevantRemovedTrees<TChild>(
	changeset: Changeset<TChild>,
	removedTreesFromChild: RemovedTreesFromTChild<TChild>,
): Iterable<Delta.DetachedNodeId> {
	for (const mark of changeset) {
		if (refersToRelevantRemovedTrees(mark)) {
			assert(
				mark.cellId !== undefined,
				"marks referring to removed trees must have an assigned cell ID",
			);
			const nodeId = nodeIdFromChangeAtom(mark.cellId);
			for (let i = 0; i < mark.count; i += 1) {
				yield offsetDetachId(nodeId, i);
			}
		}
		if (mark.changes !== undefined) {
			yield* removedTreesFromChild(mark.changes);
		}
	}
}

function refersToRelevantRemovedTrees<TChild>(mark: Mark<TChild>): boolean {
	if (mark.cellId !== undefined) {
		const effect = isTransientEffect(mark) ? mark.attach : mark;
		if (isInsert(effect) && isReattachEffect(effect, mark.cellId)) {
			// This tree is being restored.
			return true;
		} else if (isDetach(mark)) {
			if (isMoveMark(mark)) {
				// This removed tree is being moved.
				return true;
			} else {
				// This removed tree is being deleted.
				// We currently don't reassign the ID for such a tree, so it isn't relevant.
			}
		}
		if (!isNewAttach(mark) && mark.changes !== undefined) {
			// This removed tree is being edited.
			// Note: there is a possibility that the child changes only affect a distant descendant
			// which may have been removed from this (removed) subtree. In such a case, this tree is not truly
			// relevant, but including it is the conservative thing to do.
			// In the future, we may represent changes to removed trees using the ID of the lowest removed
			// ancestor, which would allow us to avoid including such trees when they truly are not needed.
			return true;
		}
	}
	return false;
}
