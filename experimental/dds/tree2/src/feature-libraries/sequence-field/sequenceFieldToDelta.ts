/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { fail, Mutable } from "../../util";
import { Delta, TaggedChange, areEqualChangeAtomIds, makeDetachedNodeId } from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { cursorForJsonableTreeNode } from "../treeTextCursor";
import { MarkList, NoopMarkType } from "./format";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isNewAttach,
	isTransientEffect,
} from "./utils";
import { isMoveDestination, isMoveSource } from "./moveEffectTable";

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
		const inputCellId = getInputCellId(mark, revision, undefined);
		const changes = mark.changes;
		if (changes !== undefined) {
			const nestedDelta = deltaFromChild(changes);
			if (nestedDelta.size > 0) {
				if (inputCellId === undefined) {
					deltaMark.fields = nestedDelta;
				} else {
					global.push({
						id: nodeIdFromChangeAtom(inputCellId),
						fields: nestedDelta,
					});
				}
			}
		}
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			// Since each cell is associated with exactly one node,
			// the cell starting end ending populated means the cell content has not changed.
			local.push(deltaMark);
		} else if (isTransientEffect(mark)) {
			assert(inputCellId !== undefined, "Transient mark should have defined input cell ID");
			// The cell starting and ending empty means the cell content has not changed,
			// unless transient content was inserted/attached.
			if (isMoveDestination(mark.attach) && isMoveSource(mark.detach)) {
				assert(mark.changes === undefined, "Transient moves should not have changes");
				continue;
			}

			const outputId = getOutputCellId(mark, revision, undefined);
			assert(outputId !== undefined, "Transient mark should have defined output cell ID");
			const oldId = nodeIdFromChangeAtom(
				isMoveDestination(mark.attach) ? getEndpoint(mark.attach, revision) : inputCellId,
			);
			if (!areEqualChangeAtomIds(inputCellId, outputId)) {
				if (mark.attach.type === "Insert" && mark.attach.content !== undefined) {
					build.push({
						id: oldId,
						trees: mark.attach.content.map(cursorForJsonableTreeNode),
					});
				}
				rename.push({
					count: mark.count,
					oldId,
					newId: nodeIdFromChangeAtom(outputId),
				});
			}
			if (deltaMark.fields) {
				global.push({
					id: oldId,
					fields: deltaMark.fields,
				});
			}
		} else {
			const type = mark.type;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			switch (type) {
				case "MoveIn": {
					local.push({
						attach: nodeIdFromChangeAtom(getEndpoint(mark, revision)),
						count: mark.count,
					});
					break;
				}
				case "Delete": {
					const newDetachId = mark.detachIdOverride ?? {
						revision: mark.revision ?? revision,
						localId: mark.id,
					};
					if (mark.cellId === undefined) {
						deltaMark.detach = nodeIdFromChangeAtom(newDetachId);
						local.push(deltaMark);
					} else {
						const oldId = nodeIdFromChangeAtom(mark.cellId);
						// Removal of already removed content is only a no-op if the detach IDs are different.
						if (!areEqualChangeAtomIds(mark.cellId, newDetachId)) {
							rename.push({
								count: mark.count,
								oldId,
								newId: nodeIdFromChangeAtom(newDetachId),
							});
						}
						// In all cases, the nested changes apply
						if (deltaMark.fields) {
							global.push({
								id: oldId,
								fields: deltaMark.fields,
							});
						}
					}
					break;
				}
				case "MoveOut":
				case "ReturnFrom": {
					// The move destination will look for the detach ID of the source, so we can ignore `finalEndpoint`.
					const detachId = makeDetachedNodeId(mark.revision ?? revision, mark.id);
					if (inputCellId === undefined) {
						deltaMark.detach = detachId;
						local.push(deltaMark);
					} else {
						// Move sources implicitly restore their content
						rename.push({
							count: mark.count,
							oldId: nodeIdFromChangeAtom(inputCellId),
							newId: detachId,
						});
					}
					break;
				}
				case "Insert": {
					assert(mark.cellId !== undefined, "Active Insert marks must have a CellId");
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
							trees: mark.content.map(cursorForJsonableTreeNode),
						});
					}
					local.push(deltaMark);
					break;
				}
				case NoopMarkType:
					if (inputCellId === undefined) {
						local.push(deltaMark);
					}
					break;
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
