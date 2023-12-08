/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { DeltaDetachedNodeId, TaggedChange, offsetDetachId } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { Changeset, Mark } from "./types";
import { isInsert, isDetachOfRemovedNodes, isAttachAndDetachEffect } from "./utils";

export type RelevantRemovedRootsFromTChild<TChild> = (
	child: TChild,
) => Iterable<DeltaDetachedNodeId>;

export function* relevantRemovedRoots<TChild>(
	{ change, revision }: TaggedChange<Changeset<TChild>>,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromTChild<TChild>,
): Iterable<DeltaDetachedNodeId> {
	for (const mark of change) {
		if (refersToRelevantRemovedRoots(mark)) {
			assert(
				mark.cellId !== undefined,
				0x81d /* marks referring to removed trees must have an assigned cell ID */,
			);
			const nodeId = nodeIdFromChangeAtom(mark.cellId, revision);
			for (let i = 0; i < mark.count; i += 1) {
				yield offsetDetachId(nodeId, i);
			}
		}
		if (mark.changes !== undefined) {
			yield* relevantRemovedRootsFromChild(mark.changes);
		}
	}
}

function refersToRelevantRemovedRoots<TChild>(mark: Mark<TChild>): boolean {
	if (mark.cellId !== undefined) {
		const effect = isAttachAndDetachEffect(mark) ? mark.attach : mark;
		if (isInsert(effect)) {
			// This tree is being inserted or restored.
			return true;
		} else if (isDetachOfRemovedNodes(mark)) {
			// This removed tree is being restored as part of a detach.
			return true;
		}
		if (mark.changes !== undefined) {
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
