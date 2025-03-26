/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { RevisionTag } from "../../core/index.js";
import { type IdAllocator, type Mutable, fail, hasSingle } from "../../util/index.js";
import {
	type CrossFieldManager,
	CrossFieldTarget,
	type NodeId,
} from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import {
	type CellId,
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	type MarkList,
	type MoveIn,
	type MoveOut,
	type NoopMark,
	NoopMarkType,
	type Remove,
	type Rename,
} from "./types.js";
import {
	extractMarkEffect,
	getDetachOutputCellId,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isAttach,
	isDetach,
	isImpactful,
	normalizeCellRename,
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
	change: Changeset,
	isRollback: boolean,
	genId: IdAllocator,
	revision: RevisionTag | undefined,
	crossFieldManager: CrossFieldManager,
): Changeset {
	return invertMarkList(
		change,
		isRollback,
		crossFieldManager as CrossFieldManager<NodeId>,
		revision,
	);
}

function invertMarkList(
	markList: MarkList,
	isRollback: boolean,
	crossFieldManager: CrossFieldManager<NodeId>,
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
	crossFieldManager: CrossFieldManager<NodeId>,
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
				idOverride: isRollback ? inputId : { localId: inputId.localId },
			};
			return [withNodeChange(inverse, mark.changes)];
		}
		case "Remove": {
			assert(mark.revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const outputId = getOutputCellId(mark);
			const inputId = getInputCellId(mark);
			let inverse: Mutable<Mark>;
			if (inputId === undefined) {
				inverse = {
					type: "Insert",
					id: mark.id,
					cellId: outputId,
					count: mark.count,
					revision,
				};
			} else {
				inverse = {
					type: "Remove",
					id: mark.id,
					cellId: outputId,
					count: mark.count,
					revision,
				};
				if (isRollback) {
					inverse.idOverride = inputId;
				}
			}
			return [withNodeChange(inverse, mark.changes)];
		}
		case "Insert": {
			const inputId = getInputCellId(mark);
			assert(inputId !== undefined, 0x80c /* Active inserts should target empty cells */);
			const removeMark: Mutable<CellMark<Remove>> = {
				type: "Remove",
				count: mark.count,
				id: inputId.localId,
				revision,
			};

			if (isRollback) {
				removeMark.idOverride = inputId;
			}

			const inverse = withNodeChange(removeMark, mark.changes);
			return [inverse];
		}
		case "MoveOut": {
			if (mark.changes !== undefined) {
				assert(mark.count === 1, 0x6ed /* Mark with changes can only target a single cell */);

				const endpoint = getEndpoint(mark);
				crossFieldManager.set(
					CrossFieldTarget.Destination,
					endpoint.revision,
					endpoint.localId,
					mark.count,
					mark.changes,
					true,
				);
			}

			const cellId = getDetachOutputCellId(mark) ?? {
				revision: mark.revision ?? fail(0xb2a /* Revision must be defined */),
				localId: mark.id,
			};

			const moveIn: MoveIn = {
				type: "MoveIn",
				id: mark.id,
				revision,
			};

			if (mark.finalEndpoint !== undefined) {
				moveIn.finalEndpoint = {
					localId: mark.finalEndpoint.localId,
					revision: mark.revision,
				};
			}
			let effect: MarkEffect = moveIn;
			const inputId = getInputCellId(mark);
			if (inputId !== undefined) {
				const detach: Mutable<Detach> = {
					type: "Remove",
					id: mark.id,
					revision,
				};
				if (isRollback) {
					detach.idOverride = inputId;
				}
				effect = {
					type: "AttachAndDetach",
					attach: moveIn,
					detach,
				};
			}
			return [{ ...effect, count: mark.count, cellId }];
		}
		case "MoveIn": {
			const inputId = getInputCellId(mark);
			assert(inputId !== undefined, 0x89e /* Active move-ins should target empty cells */);
			const invertedMark: Mutable<CellMark<MoveOut>> = {
				type: "MoveOut",
				id: mark.id,
				count: mark.count,
				revision,
			};

			if (isRollback) {
				invertedMark.idOverride = inputId;
			}

			if (mark.finalEndpoint) {
				invertedMark.finalEndpoint = {
					localId: mark.finalEndpoint.localId,
					revision: mark.revision,
				};
			}
			return applyMovedChanges(invertedMark, mark.revision, crossFieldManager);
		}
		case "AttachAndDetach": {
			const attach: Mark = {
				count: mark.count,
				cellId: mark.cellId,
				...mark.attach,
			};
			const idAfterAttach = getOutputCellId(attach);

			// We put `mark.changes` on the detach so that if it is a move source
			// the changes can be sent to the endpoint.
			const detach: Mark = {
				count: mark.count,
				cellId: idAfterAttach,
				changes: mark.changes,
				...mark.detach,
			};
			const attachInverses = invertMark(attach, isRollback, crossFieldManager, revision);
			const detachInverses = invertMark(detach, isRollback, crossFieldManager, revision);

			if (detachInverses.length === 0) {
				return attachInverses;
			}

			assert(
				hasSingle(detachInverses),
				0x80d /* Only expected MoveIn marks to be split when inverting */,
			);

			let detachInverse = detachInverses[0];
			assert(isAttach(detachInverse), 0x80e /* Inverse of a detach should be an attach */);

			const inverses: Mark[] = [];
			for (const attachInverse of attachInverses) {
				let detachInverseCurr: Mark = detachInverse;
				if (attachInverse.count !== detachInverse.count) {
					[detachInverseCurr, detachInverse] = splitMark(detachInverse, attachInverse.count);
				}

				if (attachInverse.type === NoopMarkType) {
					if (attachInverse.changes !== undefined) {
						assert(
							detachInverseCurr.changes === undefined,
							0x80f /* Unexpected node changes */,
						);
						detachInverseCurr.changes = attachInverse.changes;
					}
					inverses.push(detachInverseCurr);
					continue;
				}
				assert(isDetach(attachInverse), 0x810 /* Inverse of an attach should be a detach */);
				assert(detachInverseCurr.cellId !== undefined, 0x9f6 /* Expected empty cell */);
				const inverted = normalizeCellRename(
					detachInverseCurr.cellId,
					attachInverse.count,
					extractMarkEffect(detachInverseCurr),
					extractMarkEffect(attachInverse),
				);
				if (detachInverse.changes !== undefined) {
					inverted.changes = detachInverse.changes;
				}

				if (attachInverse.changes !== undefined) {
					assert(inverted.changes === undefined, 0x811 /* Unexpected node changes */);
					inverted.changes = attachInverse.changes;
				}
				inverses.push(inverted);
			}

			return inverses;
		}
		default:
			unreachableCase(type);
	}
}

function applyMovedChanges(
	mark: CellMark<MoveOut>,
	revision: RevisionTag | undefined,
	manager: CrossFieldManager<NodeId>,
): Mark[] {
	// Although this is a source mark, we query the destination because this was a destination mark during the original invert pass.
	const entry = manager.get(CrossFieldTarget.Destination, revision, mark.id, mark.count, true);

	if (entry.length < mark.count) {
		const [mark1, mark2] = splitMark(mark, entry.length);
		const mark1WithChanges =
			entry.value !== undefined
				? withNodeChange<CellMark<MoveOut>, MoveOut>(mark1, entry.value)
				: mark1;

		return [mark1WithChanges, ...applyMovedChanges(mark2, revision, manager)];
	}

	if (entry.value !== undefined) {
		manager.onMoveIn(entry.value);
		return [withNodeChange<CellMark<MoveOut>, MoveOut>(mark, entry.value)];
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
