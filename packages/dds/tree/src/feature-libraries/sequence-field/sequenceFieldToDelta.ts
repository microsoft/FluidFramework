/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, oob } from "@fluidframework/core-utils/internal";

import {
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type DeltaMark,
	areEqualChangeAtomIds,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";
import { nodeIdFromChangeAtom } from "../deltaUtils.js";
import { type MarkList, NoopMarkType } from "./types.js";
import {
	areInputCellsEmpty,
	areOutputCellsEmpty,
	getDetachedNodeId,
	getInputCellId,
} from "./utils.js";
import type { ToDelta } from "../modular-schema/index.js";

export function sequenceFieldToDelta(
	change: MarkList,
	deltaFromChild: ToDelta,
): DeltaFieldChanges {
	const local: DeltaMark[] = [];
	const global: DeltaDetachedNodeChanges[] = [];
	const rename: DeltaDetachedNodeRename[] = [];

	for (const mark of change) {
		const deltaMark: Mutable<DeltaMark> = { count: mark.count };
		const inputCellId = getInputCellId(mark);
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
		} else {
			const type = mark.type;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			switch (type) {
				case "Remove": {
					const newDetachId = getDetachedNodeId(mark);
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
				case "Insert": {
					const buildId = nodeIdFromChangeAtom({ revision: mark.revision, localId: mark.id });
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
				case "Rename":
					assert(
						mark.cellId !== undefined,
						0x9f9 /* Renames should only target empty cells */,
					);
					break;
				default:
					unreachableCase(type);
			}
		}
	}
	// Remove trailing no-op marks
	while (local.length > 0) {
		const lastMark = local[local.length - 1] ?? oob();
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
