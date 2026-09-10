/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";

import {
	type ChangesetLocalId,
	type RevisionTag,
	offsetChangeAtomId,
} from "../../core/index.js";
import { type IdAllocator, type Mutable, brand, hasSingle } from "../../util/index.js";
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

interface InverseMoveId {
	readonly oldId: ChangesetLocalId;
	readonly newId: ChangesetLocalId;
}

type InverseCrossFieldData = NodeId | InverseMoveId;

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
		crossFieldManager as CrossFieldManager<InverseCrossFieldData>,
		revision,
		genId,
	);
}

function invertMarkList(
	markList: MarkList,
	isRollback: boolean,
	crossFieldManager: CrossFieldManager<InverseCrossFieldData>,
	revision: RevisionTag | undefined,
	genId: IdAllocator,
): MarkList {
	const inverseMarkList = new MarkListFactory();

	for (const mark of markList) {
		const inverseMarks = invertMark(mark, isRollback, crossFieldManager, revision, genId);
		for (const inverseMark of inverseMarks) {
			inverseMarkList.pushContent(inverseMark);
		}
	}

	return inverseMarkList.list;
}

function invertMark(
	mark: Mark,
	isRollback: boolean,
	crossFieldManager: CrossFieldManager<InverseCrossFieldData>,
	revision: RevisionTag | undefined,
	genId: IdAllocator,
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
				// This reference can flow into a later composition, so its revision must be explicit.
				idOverride: isRollback
					? inputId
					: { localId: brand(genId.allocate(mark.count)), revision },
			};
			return [withNodeChange(inverse, mark.changes)];
		}
		case "Remove": {
			assert(mark.revision !== undefined, 0x5a1 /* Unable to revert to undefined revision */);
			const outputId = getOutputCellId(mark);
			const inputId = getInputCellId(mark);
			const inverseId: ChangesetLocalId = isRollback
				? mark.id
				: brand(genId.allocate(mark.count));
			let inverse: Mutable<Mark>;
			if (inputId === undefined) {
				inverse = {
					type: "Insert",
					id: inverseId,
					cellId: outputId,
					count: mark.count,
					revision,
				};
			} else {
				inverse = {
					type: "Remove",
					id: inverseId,
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
				id: isRollback ? inputId.localId : brand(genId.allocate(mark.count)),
				revision,
			};

			if (isRollback) {
				removeMark.idOverride = inputId;
			}

			const inverse = withNodeChange(removeMark, mark.changes);
			return [inverse];
		}
		case "MoveOut": {
			const ids = isRollback ? undefined : getInverseMoveIds(mark, genId, crossFieldManager);
			if (ids !== undefined && ids.length < mark.count) {
				return splitAndInvert(
					mark,
					ids.length,
					isRollback,
					crossFieldManager,
					revision,
					genId,
				);
			}
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
				id: ids?.id ?? mark.id,
				revision,
			};

			if (mark.finalEndpoint !== undefined) {
				moveIn.finalEndpoint = {
					localId: ids?.finalEndpoint ?? mark.finalEndpoint.localId,
					revision,
				};
			}
			let effect: MarkEffect = moveIn;
			const inputId = getInputCellId(mark);
			if (inputId !== undefined) {
				const detach: Mutable<Detach> = {
					type: "Remove",
					id: ids?.id ?? mark.id,
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
			const ids = isRollback ? undefined : getInverseMoveIds(mark, genId, crossFieldManager);
			if (ids !== undefined && ids.length < mark.count) {
				return splitAndInvert(
					mark,
					ids.length,
					isRollback,
					crossFieldManager,
					revision,
					genId,
				);
			}
			const inputId = getInputCellId(mark);
			assert(inputId !== undefined, 0x89e /* Active move-ins should target empty cells */);
			const invertedMark: Mutable<CellMark<MoveOut>> = {
				type: "MoveOut",
				id: ids?.id ?? mark.id,
				count: mark.count,
				revision,
			};

			if (isRollback) {
				invertedMark.idOverride = inputId;
			}

			if (mark.finalEndpoint) {
				invertedMark.finalEndpoint = {
					localId: ids?.finalEndpoint ?? mark.finalEndpoint.localId,
					revision,
				};
			}
			return applyMovedChanges(
				invertedMark,
				{ revision: mark.revision, localId: mark.id },
				crossFieldManager,
			);
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
			const attachInverses = invertMark(
				attach,
				isRollback,
				crossFieldManager,
				revision,
				genId,
			);
			const detachInverses = invertMark(
				detach,
				isRollback,
				crossFieldManager,
				revision,
				genId,
			);

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
		default: {
			unreachableCase(type);
		}
	}
}

function splitAndInvert(
	mark: CellMark<MoveIn | MoveOut>,
	length: number,
	isRollback: boolean,
	manager: CrossFieldManager<InverseCrossFieldData>,
	revision: RevisionTag | undefined,
	genId: IdAllocator,
): Mark[] {
	const [first, second] = splitMark(mark, length);
	const pending = [second, first];
	const result: Mark[] = [];
	for (let fragment = pending.pop(); fragment !== undefined; fragment = pending.pop()) {
		const ids = isRollback ? undefined : getInverseMoveIds(fragment, genId, manager);
		if (ids !== undefined && ids.length < fragment.count) {
			const [head, tail] = splitMark(fragment, ids.length);
			pending.push(tail, head);
			continue;
		}
		for (const inverse of invertMark(fragment, isRollback, manager, revision, genId)) {
			result.push(inverse);
		}
	}
	return result;
}

function getInverseMoveIds(
	mark: CellMark<MoveIn | MoveOut>,
	genId: IdAllocator,
	manager: CrossFieldManager<InverseCrossFieldData>,
): { id: ChangesetLocalId; finalEndpoint?: ChangesetLocalId; length: number } {
	const own = getInverseMoveId(
		{ revision: mark.revision, localId: mark.id },
		mark.count,
		genId,
		manager,
	);
	const endpoint =
		mark.finalEndpoint === undefined
			? undefined
			: getInverseMoveId(mark.finalEndpoint, mark.count, genId, manager);
	return {
		id: own.id,
		finalEndpoint: endpoint?.id,
		length: Math.min(own.length, endpoint?.length ?? own.length),
	};
}

function getInverseMoveId(
	original: CellId,
	count: number,
	genId: IdAllocator,
	manager: CrossFieldManager<InverseCrossFieldData>,
): { id: ChangesetLocalId; length: number } {
	// Destination carries moved node changes. Source shares remapped IDs across move
	// endpoints and amended field passes within this inversion.
	const entry = manager.get(
		CrossFieldTarget.Source,
		original.revision,
		original.localId,
		count,
		false,
	);
	if (entry.value === undefined) {
		const id: ChangesetLocalId = brand(genId.allocate(entry.length));
		manager.set(
			CrossFieldTarget.Source,
			original.revision,
			original.localId,
			entry.length,
			{ oldId: original.localId, newId: id },
			false,
		);
		return { id, length: entry.length };
	}
	assert("oldId" in entry.value, "Expected inverse move ID mapping");
	return {
		id: brand(entry.value.newId + original.localId - entry.value.oldId),
		length: entry.length,
	};
}

function applyMovedChanges(
	mark: CellMark<MoveOut>,
	originalId: CellId,
	manager: CrossFieldManager<InverseCrossFieldData>,
): Mark[] {
	const result: Mark[] = [];
	let remaining = mark;
	let remainingOriginalId = originalId;
	for (;;) {
		// Query by the original endpoint, not its newly allocated inverse ID.
		const entry = manager.get(
			CrossFieldTarget.Destination,
			remainingOriginalId.revision,
			remainingOriginalId.localId,
			remaining.count,
			true,
		);
		const nodeChange = entry.value;
		assert(nodeChange === undefined || "localId" in nodeChange, "Expected moved node change");

		if (entry.length < remaining.count) {
			const [head, tail] = splitMark(remaining, entry.length);
			result.push(
				nodeChange === undefined
					? head
					: withNodeChange<CellMark<MoveOut>, MoveOut>(head, nodeChange),
			);
			remaining = tail;
			remainingOriginalId = offsetChangeAtomId(remainingOriginalId, entry.length);
			continue;
		}
		if (nodeChange === undefined) {
			result.push(remaining);
		} else {
			manager.onMoveIn(nodeChange);
			result.push(withNodeChange<CellMark<MoveOut>, MoveOut>(remaining, nodeChange));
		}
		return result;
	}
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
