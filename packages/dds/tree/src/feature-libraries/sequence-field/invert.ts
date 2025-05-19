/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { offsetChangeAtomId, type ChangeAtomId, type RevisionTag } from "../../core/index.js";
import type { IdAllocator, Mutable } from "../../util/index.js";
import type {
	ContextualizedFieldChange,
	InvertNodeManager,
	NodeId,
} from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import {
	type CellId,
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkList,
	type NoopMark,
	NoopMarkType,
	type Remove,
	type Rename,
} from "./types.js";
import {
	areEqualCellIds,
	getInputCellId,
	getOutputCellId,
	isImpactful,
	splitMark,
	withNodeChange,
} from "./utils.js";

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @param isRollback - Whether the inverse is being produced for a rollback.
 * @param genId - The ID allocator to use for generating new IDs.
 * @param revision - The revision to use for the inverse changeset.
 * @param crossFieldManager - The cross-field manager to use for tracking cross-field changes.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert(
	{ change }: ContextualizedFieldChange<Changeset>,
	isRollback: boolean,
	genId: IdAllocator,
	revision: RevisionTag | undefined,
	crossFieldManager: InvertNodeManager,
): Changeset {
	return invertMarkList(change, isRollback, crossFieldManager, revision);
}

function invertMarkList(
	markList: MarkList,
	isRollback: boolean,
	crossFieldManager: InvertNodeManager,
	revision: RevisionTag | undefined,
): MarkList {
	const inverseMarkList = new MarkListFactory();

	for (const mark of markList) {
		const inverseMarks = invertMark(mark, isRollback, crossFieldManager, revision);
		inverseMarkList.push(...inverseMarks);
	}

	return inverseMarkList.list;
}

function invertMark(
	mark: Mark,
	isRollback: boolean,
	crossFieldManager: InvertNodeManager,
	revision: RevisionTag | undefined,
): Mark[] {
	if (!isImpactful(mark)) {
		const inputId = getInputCellId(mark);
		return [invertNodeChangeOrSkip(mark.count, mark.changes, inputId)];
	}
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			return [mark];
		}
		case "Rename": {
			const inputId = getInputCellId(mark);
			assert(inputId !== undefined, 0x9f5 /* Rename mark must have cell ID */);
			const inverse: Mutable<CellMark<Rename>> = {
				type: "Rename",
				count: mark.count,
				cellId: mark.idOverride,
				// Unlike a remove or move-out, which follow a node, there is no way for this mark to assign the original input cell ID to another cell.
				// This means it should be safe to always restore the input cell ID (as opposed to only doing it on rollbacks).
				// Despite that, we still only do it on rollback for the sake of consistency: once a cell has been assigned an ID,
				// the only way for that cell to be assigned that ID again is if it is rolled back to that state.
				idOverride: isRollback ? inputId : { revision, localId: inputId.localId },
			};
			return [withNodeChange(inverse, mark.changes)];
		}
		case "Remove": {
			assert(mark.revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const outputId = getOutputCellId(mark);
			const inputId = getInputCellId(mark);
			assert(inputId === undefined, "Unexpected remove of detached node");

			const attachId = { revision: isRollback ? mark.revision : revision, localId: mark.id };
			crossFieldManager.invertDetach(
				{ revision: mark.revision, localId: mark.id },
				mark.count,
				mark.changes,
				attachId,
			);

			const inverse: Mark = {
				type: "Insert",
				id: mark.id,
				cellId: outputId,
				count: mark.count,
				revision: attachId.revision,
			};
			return [inverse];
		}
		case "Insert": {
			const inputId = getInputCellId(mark);
			assert(inputId !== undefined, 0x80c /* Active inserts should target empty cells */);

			const detachId: ChangeAtomId = {
				revision: isRollback ? mark.revision : revision,
				localId: mark.id,
			};

			const removeMark: Mutable<CellMark<Remove>> = {
				type: "Remove",
				count: mark.count,
				id: detachId.localId,
				revision: detachId.revision,
			};

			if (isRollback && !areEqualCellIds(inputId, detachId)) {
				removeMark.idOverride = inputId;
			}

			return applyMovedChanges(removeMark, mark.revision, crossFieldManager, detachId);
		}
		default:
			unreachableCase(type);
	}
}

function applyMovedChanges(
	mark: CellMark<Detach>,
	revision: RevisionTag | undefined,
	manager: InvertNodeManager,
	newDetachId: ChangeAtomId,
): Mark[] {
	const entry = manager.invertAttach({ revision, localId: mark.id }, mark.count, newDetachId);

	if (entry.length < mark.count) {
		const [mark1, mark2] = splitMark(mark, entry.length);
		const mark1WithChanges =
			entry.value !== undefined
				? withNodeChange<CellMark<Detach>, Detach>(mark1, entry.value)
				: mark1;

		return [
			mark1WithChanges,
			...applyMovedChanges(
				mark2,
				revision,
				manager,
				offsetChangeAtomId(newDetachId, mark.count - entry.length),
			),
		];
	}

	if (entry.value !== undefined) {
		return [withNodeChange<CellMark<Detach>, Detach>(mark, entry.value)];
	}

	return [mark];
}

function invertNodeChangeOrSkip(
	count: number,
	changes: NodeId | undefined,
	cellId?: CellId,
): Mark {
	if (changes !== undefined) {
		assert(count === 1, 0x66c /* A modify mark must have length equal to one */);
		const noop: CellMark<NoopMark> = {
			count,
			changes,
		};
		if (cellId !== undefined) {
			noop.cellId = cellId;
		}
		return noop;
	}

	if (cellId !== undefined) {
		return { count, cellId };
	}
	return { count };
}
