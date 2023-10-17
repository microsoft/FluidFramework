/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { fail, Mutable } from "../../util";
import { Delta, TaggedChange, areEqualChangeAtomIds, makeDetachedNodeId } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { singleTextCursor } from "../treeTextCursor";
import { MarkList, NoopMarkType } from "./format";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getEffectiveNodeChanges,
	isInsert,
	isNewAttach,
	markIsTransient,
} from "./utils";

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.FieldsChanges;

export function sequenceFieldToDelta<TNodeChange>(
	{ change, revision }: TaggedChange<MarkList<TNodeChange>>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.FieldChanges {
	const delta: Mutable<Delta.FieldChanges> = {};
	const attached: Delta.Mark[] = [];
	const detached: Delta.DetachedNodeChanges[] = [];
	const build: Delta.DetachedNodeBuild[] = [];
	const relocate: Delta.DetachedNodeRelocation[] = [];

	for (const mark of change) {
		const deltaMark: Mutable<Delta.Mark> = { count: mark.count };
		const changes = getEffectiveNodeChanges(mark);
		if (changes !== undefined) {
			deltaMark.fields = deltaFromChild(changes);
		}
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			// Since each cell is associated with exactly one node,
			// the cell starting end ending populated means the cell content has not changed.
			attached.push(deltaMark);
		} else if (areInputCellsEmpty(mark) && areOutputCellsEmpty(mark)) {
			// The cell starting and ending empty means the cell content has not changed,
			// unless transient content was inserted/attached.
			if (markIsTransient(mark)) {
				const startId = nodeIdFromChangeAtom(mark.cellId);
				if (!areEqualChangeAtomIds(mark.cellId, mark.transientDetach)) {
					// TODO: handle transient move-in/return-to
					assert(isInsert(mark), "Expected non-insert transient mark");
					if (isNewAttach(mark)) {
						assert(mark.content !== undefined, "New insert must have content");
						build.push({
							id: startId,
							trees: mark.content.map(singleTextCursor),
						});
					}
					relocate.push({
						id: startId,
						count: mark.count,
						destination: nodeIdFromChangeAtom(mark.transientDetach),
					});
				}
				if (deltaMark.fields) {
					detached.push({
						id: startId,
						fields: deltaMark.fields,
					});
				}
			}
		} else {
			const type = mark.type;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			switch (type) {
				case "MoveIn": {
					attached.push({
						attach: makeDetachedNodeId(mark.revision ?? revision, mark.id),
						count: mark.count,
					});
					break;
				}
				case NoopMarkType: {
					if (mark.cellId === undefined) {
						attached.push(deltaMark);
					} else {
						// TODO: pass on nested changes if any
					}
					break;
				}
				case "Delete": {
					if (mark.cellId === undefined) {
						deltaMark.detach = makeDetachedNodeId(mark.revision ?? revision, mark.id);
						attached.push(deltaMark);
					} else {
						// Removal of already removed content is a no-op.
						// It does not relocate the content to the detached field that would otherwise be created.
						// TODO: pass on nested changes if any
					}
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					const detachId = makeDetachedNodeId(mark.revision ?? revision, mark.id);
					if (mark.cellId === undefined) {
						deltaMark.detach = detachId;
						attached.push(deltaMark);
					} else {
						// TODO: relocate content to `detachId` field
					}
					break;
				}
				case "Insert": {
					assert(mark.transientDetach === undefined, "Unexpected transient insert");
					assert(mark.cellId !== undefined, "Active insert mark must have CellId");
					const buildId = nodeIdFromChangeAtom(mark.cellId);
					deltaMark.attach = buildId;
					if (isNewAttach(mark)) {
						assert(mark.content !== undefined, "New insert must have content");
						build.push({
							id: buildId,
							trees: mark.content.map(singleTextCursor),
						});
					}
					attached.push(deltaMark);
					break;
				}
				case "Placeholder":
					fail("Should not have placeholders in a changeset being converted to delta");
				default:
					unreachableCase(type);
			}
		}
	}
	if (attached.length > 0) {
		delta.attached = attached;
	}
	if (detached.length > 0) {
		delta.detached = detached;
	}
	if (build.length > 0) {
		delta.build = build;
	}
	if (relocate.length > 0) {
		delta.relocate = relocate;
	}
	return delta;
}
