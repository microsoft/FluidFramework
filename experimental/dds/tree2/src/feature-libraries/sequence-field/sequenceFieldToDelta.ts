/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { Mutable } from "../../util";
import {
	DeltaDetachedNodeChanges,
	DeltaDetachedNodeRename,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaMark,
	TaggedChange,
	areEqualChangeAtomIds,
	makeDetachedNodeId,
} from "../../core";
import { nodeIdFromChangeAtom } from "../deltaUtils";
import { MarkList, NoopMarkType } from "./types";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isAttachAndDetachEffect,
	getDetachOutputId,
} from "./utils";
import { isMoveIn, isMoveOut } from "./moveEffectTable";

export type ToDelta<TNodeChange> = (child: TNodeChange) => DeltaFieldMap;

export function sequenceFieldToDelta<TNodeChange>(
	{ change, revision }: TaggedChange<MarkList<TNodeChange>>,
	deltaFromChild: ToDelta<TNodeChange>,
): DeltaFieldChanges {
	const local: DeltaMark[] = [];
	const global: DeltaDetachedNodeChanges[] = [];
	const rename: DeltaDetachedNodeRename[] = [];

	for (const mark of change) {
		const deltaMark: Mutable<DeltaMark> = { count: mark.count };
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
		} else if (isAttachAndDetachEffect(mark)) {
			assert(
				inputCellId !== undefined,
				0x81e /* AttachAndDetach mark should have defined input cell ID */,
			);
			// The cell starting and ending empty means the cell content has not changed,
			// unless transient content was inserted/attached.
			if (isMoveIn(mark.attach) && isMoveOut(mark.detach)) {
				assert(
					mark.changes === undefined,
					0x81f /* AttachAndDetach moves should not have changes */,
				);
				continue;
			}

			const outputId = getOutputCellId(mark, revision, undefined);
			assert(
				outputId !== undefined,
				0x820 /* AttachAndDetach mark should have defined output cell ID */,
			);
			const oldId = nodeIdFromChangeAtom(
				isMoveIn(mark.attach) ? getEndpoint(mark.attach, revision) : inputCellId,
			);
			if (!areEqualChangeAtomIds(inputCellId, outputId)) {
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
					const newDetachId = getDetachOutputId(mark, revision, undefined);
					if (inputCellId === undefined) {
						deltaMark.detach = nodeIdFromChangeAtom(newDetachId);
						local.push(deltaMark);
					} else {
						const oldId = nodeIdFromChangeAtom(inputCellId);
						// Removal of already removed content is only a no-op if the detach IDs are different.
						if (!areEqualChangeAtomIds(inputCellId, newDetachId)) {
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
				case "MoveOut": {
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
					assert(
						inputCellId !== undefined,
						0x821 /* Active Insert marks must have a CellId */,
					);
					const buildId = nodeIdFromChangeAtom(inputCellId);
					deltaMark.attach = buildId;
					if (deltaMark.fields) {
						// Nested changes are represented on the node in its starting location
						global.push({ id: buildId, fields: deltaMark.fields });
						delete deltaMark.fields;
					}
					local.push(deltaMark);
					break;
				}
				case NoopMarkType:
					if (inputCellId === undefined) {
						local.push(deltaMark);
					}
					break;
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
	const delta: Mutable<DeltaFieldChanges> = {};
	if (local.length > 0) {
		delta.local = local;
	}
	if (global.length > 0) {
		delta.global = global;
	}
	if (rename.length > 0) {
		delta.rename = rename;
	}
	return delta;
}
