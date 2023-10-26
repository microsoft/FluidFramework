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

export type ToDelta<TNodeChange> = (child: TNodeChange) => Delta.FieldMap;

export function sequenceFieldToDelta<TNodeChange>(
	{ change, revision }: TaggedChange<MarkList<TNodeChange>>,
	deltaFromChild: ToDelta<TNodeChange>,
): Delta.FieldChanges {
	const local: Delta.Mark[] = [];
	const global: Delta.DetachedNodeChanges[] = [];
	const build: Delta.DetachedNodeBuild[] = [];
	const rename: Delta.DetachedNodeRename[] = [];

	for (const mark of change) {
		const deltaMark: Mutable<Delta.Mark> = { count: mark.count };
		const changes = getEffectiveNodeChanges(mark);
		if (changes !== undefined) {
			deltaMark.fields = deltaFromChild(changes);
			if (deltaMark.fields.size === 0) {
				delete deltaMark.fields;
			}
		}
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			// Since each cell is associated with exactly one node,
			// the cell starting end ending populated means the cell content has not changed.
			local.push(deltaMark);
		} else if (areInputCellsEmpty(mark) && areOutputCellsEmpty(mark)) {
			// The cell starting and ending empty means the cell content has not changed,
			// unless transient content was inserted/attached.
			if (markIsTransient(mark)) {
				const oldId = nodeIdFromChangeAtom(mark.cellId);
				if (!areEqualChangeAtomIds(mark.cellId, mark.transientDetach)) {
					// TODO: handle transient move-in/return-to
					assert(isInsert(mark), 0x7d9 /* Unexpected non-insert transient mark */);
					if (mark.content !== undefined) {
						build.push({
							id: oldId,
							trees: mark.content.map(singleTextCursor),
						});
					}
					rename.push({
						count: mark.count,
						oldId,
						newId: nodeIdFromChangeAtom(mark.transientDetach),
					});
				}
				if (deltaMark.fields) {
					global.push({
						id: oldId,
						fields: deltaMark.fields,
					});
				}
			}
		} else {
			const type = mark.type;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			switch (type) {
				case "MoveIn": {
					local.push({
						attach: makeDetachedNodeId(mark.revision ?? revision, mark.id),
						count: mark.count,
					});
					break;
				}
				case "Delete": {
					if (mark.cellId === undefined) {
						deltaMark.detach = makeDetachedNodeId(mark.revision ?? revision, mark.id);
						local.push(deltaMark);
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
						local.push(deltaMark);
					} else {
						// TODO: relocate content to `detachId` field
					}
					break;
				}
				case "Insert": {
					assert(
						mark.transientDetach === undefined,
						0x7da /* Unexpected transient insert */,
					);
					assert(
						mark.cellId !== undefined,
						0x7db /* Active insert mark must have CellId */,
					);
					const buildId = nodeIdFromChangeAtom(mark.cellId);
					deltaMark.attach = buildId;
					if (deltaMark.fields) {
						// Nested changes are represented on the node in its starting location
						global.push({ id: buildId, fields: deltaMark.fields });
						delete deltaMark.fields;
					}
					if (isNewAttach(mark)) {
						assert(
							mark.content !== undefined,
							0x7dc /* New insert must have content */,
						);
						build.push({
							id: buildId,
							trees: mark.content.map(singleTextCursor),
						});
					}
					local.push(deltaMark);
					break;
				}
				case NoopMarkType:
					fail("Unexpected NoopMarkType where cell is supposed to be affected");
				case "Placeholder":
					fail("Should not have placeholders in a changeset being converted to delta");
				default:
					unreachableCase(type);
			}
		}
	}
	// Remove trailing no-op marks
	while (local.length > 0) {
		const lastMark = local[local.length - 1];
		if (
			lastMark.attach !== undefined ||
			lastMark.detach !== undefined ||
			lastMark.fields !== undefined
		) {
			break;
		}
		local.pop();
	}
	const delta: Mutable<Delta.FieldChanges> = {};
	if (local.length > 0) {
		delta.local = local;
	}
	if (global.length > 0) {
		delta.global = global;
	}
	if (build.length > 0) {
		delta.build = build;
	}
	if (rename.length > 0) {
		delta.rename = rename;
	}
	return delta;
}
