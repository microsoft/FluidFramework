/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { DeltaFieldChanges, DeltaMark } from "../../core/index.js";
import { getLast, hasSome, type Mutable } from "../../util/index.js";
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
	const deltaMarks: DeltaMark[] = [];

	for (const mark of change) {
		const deltaMark: Mutable<DeltaMark> = { count: mark.count };
		const inputCellId = getInputCellId(mark);
		const changes = mark.changes;
		if (changes !== undefined && inputCellId === undefined) {
			const nestedDelta = deltaFromChild(changes);
			if (nestedDelta.size > 0) {
				deltaMark.fields = nestedDelta;
			}
		}
		if (!areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark)) {
			// Since each cell is associated with exactly one node,
			// the cell starting end ending populated means the cell content has not changed.
			deltaMarks.push(deltaMark);
		} else {
			const type = mark.type;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			switch (type) {
				case "Remove": {
					const newDetachId = getDetachedNodeId(mark);
					if (inputCellId === undefined) {
						deltaMark.detach = nodeIdFromChangeAtom(newDetachId);
						deltaMarks.push(deltaMark);
					}
					break;
				}
				case "Insert": {
					assert(mark.cellId !== undefined, "Unexpected cell state");
					const buildId = nodeIdFromChangeAtom(mark.cellId);
					deltaMark.attach = buildId;
					deltaMarks.push(deltaMark);
					break;
				}
				case NoopMarkType:
					if (inputCellId === undefined) {
						deltaMarks.push(deltaMark);
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
	while (hasSome(deltaMarks)) {
		const lastMark = getLast(deltaMarks);
		if (
			lastMark.attach !== undefined ||
			lastMark.detach !== undefined ||
			lastMark.fields !== undefined
		) {
			break;
		}
		deltaMarks.pop();
	}

	return deltaMarks;
}
