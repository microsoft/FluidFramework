/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { ChangeAtomId, RevisionMetadataSource, RevisionTag } from "../../core/index.js";
import type { IdAllocator } from "../../util/index.js";
import {
	type RebaseNodeManager,
	type NodeChangeRebaser,
	NodeAttachState,
	type NodeId,
	type RebaseRevisionMetadata,
} from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import { MarkQueue } from "./markQueue.js";
import type { NodeRangeQueryFunc } from "./moveEffectTable.js";
import {
	type Attach,
	type CellId,
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	type MarkList,
	type MoveId,
	type NoopMark,
	NoopMarkType,
} from "./types.js";
import {
	CellOrder,
	areInputCellsEmpty,
	cellSourcesFromMarks,
	cloneCellId,
	cloneMark,
	compareCellPositionsUsingTombstones,
	extractMarkEffect,
	getDetachOutputCellId,
	getDetachedNodeId,
	getInputCellId,
	isAttach,
	isDetach,
	isNewAttach,
	isRename,
	isTombstone,
	markEmptiesCells,
	markFillsCells,
	withNodeChange,
} from "./utils.js";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 */
export function rebase(
	change: Changeset,
	base: Changeset,
	rebaseChild: NodeChangeRebaser,
	genId: IdAllocator,
	manager: RebaseNodeManager,
	revisionMetadata: RebaseRevisionMetadata,
): Changeset {
	return rebaseMarkList(
		change,
		base,
		revisionMetadata,
		rebaseChild,
		genId,
		manager as SequenceRebaseNodeManager,
	);
}

function rebaseMarkList(
	currMarkList: MarkList,
	baseMarkList: MarkList,
	metadata: RebaseRevisionMetadata,
	rebaseChild: NodeChangeRebaser,
	genId: IdAllocator,
	moveEffects: SequenceRebaseNodeManager,
): MarkList {
	const factory = new MarkListFactory();
	const queue = new RebaseQueue(baseMarkList, currMarkList, metadata, moveEffects);

	while (!queue.isEmpty()) {
		const { baseMark, newMark: currMark } = queue.pop();
		const rebasedMark = rebaseMark(currMark, baseMark, rebaseChild, moveEffects);
		factory.push(rebasedMark);
	}

	return factory.list;
}

/**
 * Generates a NoOp mark that targets the same cells as the input mark.
 * @param mark - The mark the NoOp should target.
 * @param revision - The revision, if available.
 * @returns A NoOp mark that targets the same cells as the input mark.
 */
function generateNoOpWithCellId(mark: Mark): CellMark<NoopMark> {
	const length = mark.count;
	const cellId = getInputCellId(mark);
	return cellId === undefined ? { count: length } : { count: length, cellId };
}

class RebaseQueue {
	private readonly baseMarks: MarkQueue;
	private readonly newMarks: MarkQueue;
	private readonly baseMarksCellSources: ReadonlySet<RevisionTag | undefined>;
	private readonly newMarksCellSources: ReadonlySet<RevisionTag | undefined>;

	public constructor(
		baseMarks: Changeset,
		newMarks: Changeset,
		private readonly metadata: RevisionMetadataSource,
		private readonly moveEffects: SequenceRebaseNodeManager,
	) {
		const queryFunc: NodeRangeQueryFunc = (id, count) =>
			moveEffects.getNewChangesForBaseAttach(id, count).length;

		this.baseMarks = new MarkQueue(baseMarks, queryFunc);
		this.newMarks = new MarkQueue(newMarks, queryFunc);
		this.baseMarksCellSources = cellSourcesFromMarks(baseMarks, getInputCellId);
		this.newMarksCellSources = cellSourcesFromMarks(newMarks, getInputCellId);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): RebaseMarks {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			!(baseMark === undefined && newMark === undefined),
			0x722 /* Cannot pop from empty queue */,
		);

		if (baseMark === undefined) {
			const dequeuedNewMark = this.newMarks.dequeue();
			return {
				baseMark: generateNoOpWithCellId(dequeuedNewMark),
				newMark: dequeuedNewMark,
			};
		} else if (newMark === undefined) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseId = getInputCellId(baseMark);
			const newId = getInputCellId(newMark);
			assert(
				baseId !== undefined && newId !== undefined,
				0x89f /* Both marks should have cell IDs */,
			);
			const comparison = compareCellPositionsUsingTombstones(
				baseId,
				newId,
				this.baseMarksCellSources,
				this.newMarksCellSources,
				this.metadata,
			);
			switch (comparison) {
				case CellOrder.SameCell:
					return this.dequeueBoth();
				case CellOrder.OldThenNew:
					return this.dequeueBase();
				case CellOrder.NewThenOld:
					return this.dequeueNew();
				default:
					unreachableCase(comparison);
			}
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else if (areInputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else {
			return this.dequeueBoth();
		}
	}

	private dequeueBase(length?: number): RebaseMarks {
		const baseMark =
			length !== undefined ? this.baseMarks.dequeueUpTo(length) : this.baseMarks.dequeue();

		let newMark: Mark = generateNoOpWithCellId(baseMark);

		const movedEffect = getMovedEffectFromBaseMark(this.moveEffects, baseMark);

		if (movedEffect !== undefined) {
			newMark = addMovedMarkEffect(newMark, movedEffect);
		}

		return {
			baseMark,
			newMark,
		};
	}

	private dequeueNew(): RebaseMarks {
		const newMark = this.newMarks.dequeue();
		return { newMark, baseMark: generateNoOpWithCellId(newMark) };
	}

	private dequeueBoth(): RebaseMarks {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x69c /* Cannot dequeue both unless both mark queues are non-empty */,
		);
		const length = Math.min(newMark.count, baseMark.count);
		const sizedBaseMark = this.baseMarks.dequeueUpTo(length);
		const sizedNewMark = this.newMarks.dequeueUpTo(length);
		const movedMark = getMovedEffectFromBaseMark(this.moveEffects, sizedBaseMark);
		return {
			baseMark: sizedBaseMark,
			newMark:
				movedMark === undefined ? sizedNewMark : addMovedMarkEffect(sizedNewMark, movedMark),
		};
	}
}

/**
 * Combines `mark` and `effect` into a single mark.
 * This function is only intended to handle cases where `mark` is part of a changeset being rebased
 * and `effect` is an effect from the same changeset whose target has been moved by the base changeset.
 * @returns a mark which has the composite effect of `mark` and `effect`.
 */
function addMovedMarkEffect(mark: Mark, effect: Detach): Mark {
	if (isAttach(mark) && isDetach(effect)) {
		return { ...mark, type: "Insert" };
	} else if (isRename(mark) && isDetach(effect)) {
		return { ...effect, count: mark.count, idOverride: mark.idOverride };
	} else if (isTombstone(mark)) {
		return { ...mark, ...effect };
	}
	assert(false, 0x818 /* Unexpected combination of mark effects at source and destination */);
}

/**
 * Represents the marks rebasing should process next.
 * If `baseMark` and `newMark` are both defined, then they are `SizedMark`s covering the same range of nodes.
 */
interface RebaseMarks {
	baseMark: Mark;
	newMark: Mark;
}

function rebaseMark(
	currMark: Mark,
	baseMark: Mark,
	rebaseChild: NodeChangeRebaser,
	moveEffects: SequenceRebaseNodeManager,
): Mark {
	const rebasedMark = rebaseNodeChange(cloneMark(currMark), baseMark, rebaseChild);
	const movedNodeChanges = getMovedChangesFromBaseMark(moveEffects, baseMark);
	if (movedNodeChanges !== undefined) {
		assert(
			rebasedMark.changes === undefined,
			0x8dc /* Unexpected collision of new node changes */,
		);
		rebasedMark.changes = movedNodeChanges;

		// XXX
		// moveEffects.onMoveIn(movedNodeChanges);
	}

	return rebaseMarkIgnoreChild(rebasedMark, baseMark, moveEffects);
}

function rebaseMarkIgnoreChild(
	currMark: Mark,
	baseMark: Mark,
	moveEffects: SequenceRebaseNodeManager,
): Mark {
	let rebasedMark: Mark;
	if (isDetach(baseMark)) {
		if (baseMark.cellId !== undefined) {
			// Detaches on empty cells have an implicit revive effect.
			delete currMark.cellId;
		}
		assert(
			!isNewAttach(currMark),
			0x69d /* A new attach should not be rebased over its cell being emptied */,
		);
		const baseCellId = getDetachOutputCellId(baseMark);

		const { remains, follows } = separateEffectsForMove(extractMarkEffect(currMark));
		moveRebasedChanges(
			moveEffects,
			getDetachedNodeId(baseMark),
			baseMark.count,
			currMark.changes,
			follows,
		);

		rebasedMark = { ...(remains ?? {}), count: baseMark.count };
		rebasedMark = makeDetachedMark(rebasedMark, cloneCellId(baseCellId));
	} else if (markFillsCells(baseMark)) {
		rebasedMark = withCellId(currMark, undefined);
	} else if (isRename(baseMark)) {
		return withCellId(currMark, getDetachOutputCellId(baseMark));
	} else {
		rebasedMark = currMark;
	}
	return rebasedMark;
}

/**
 * @returns A pair of marks that represent the effects which should remain in place in the face of concurrent move,
 * and the effects that should be sent to the move destination.
 */
function separateEffectsForMove(mark: MarkEffect): {
	remains?: MarkEffect;
	follows?: Detach;
} {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return {};
		case "Remove":
			return { follows: mark };
		case "Rename":
			return { remains: mark };
		case "Insert": {
			const follows: Detach = {
				type: "Remove",
				id: mark.id,
			};
			const remains: Attach = {
				type: "Insert",
				id: mark.id,
			};
			if (mark.revision !== undefined) {
				follows.revision = mark.revision;
				remains.revision = mark.revision;
			}
			return { remains, follows };
		}
		default:
			unreachableCase(type);
	}
}

function moveRebasedChanges(
	moveEffects: SequenceRebaseNodeManager,
	baseId: ChangeAtomId,
	count: number,
	nodeChange: NodeId | undefined,
	newDetach: Detach | undefined,
): void {
	const newId = newDetach !== undefined ? getDetachedNodeId(newDetach) : undefined;
	moveEffects.rebaseOverDetach(baseId, count, newId, nodeChange, newDetach);
}

function rebaseNodeChange(
	currMark: Mark,
	baseMark: Mark,
	nodeRebaser: NodeChangeRebaser,
): Mark {
	const baseChange = baseMark.changes;
	const currChange = currMark.changes;

	if (baseChange === undefined && currChange === undefined) {
		return currMark;
	}

	const nodeState = nodeStateAfterMark(baseMark);
	return withNodeChange(currMark, nodeRebaser(currChange, baseChange, nodeState));
}

function nodeStateAfterMark(mark: Mark): NodeAttachState {
	if (markEmptiesCells(mark)) {
		return NodeAttachState.Detached;
	} else if (markFillsCells(mark)) {
		return NodeAttachState.Attached;
	} else {
		return mark.cellId === undefined ? NodeAttachState.Attached : NodeAttachState.Detached;
	}
}

function makeDetachedMark(mark: Mark, cellId: ChangeAtomId): Mark {
	assert(mark.cellId === undefined, 0x69f /* Expected mark to be attached */);
	return { ...mark, cellId };
}

function withCellId<TMark extends Mark>(mark: TMark, cellId: CellId | undefined): TMark {
	const newMark = { ...mark, cellId };
	if (cellId === undefined) {
		delete newMark.cellId;
	}
	return newMark;
}

function getMovedEffectFromBaseMark(
	moveEffects: SequenceRebaseNodeManager,
	baseMark: Mark,
): Detach | undefined {
	return isAttach(baseMark)
		? getMovedEffect(moveEffects, baseMark.revision, baseMark.id, baseMark.count)
		: undefined;
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getMovedEffect(
	moveEffects: SequenceRebaseNodeManager,
	revision: RevisionTag | undefined,
	localId: MoveId,
	count: number,
): Detach | undefined {
	const entry = moveEffects.getNewChangesForBaseAttach({ revision, localId }, count);
	assert(entry.length === count, 0x6f3 /* Expected effect to cover entire mark */);
	const movedEffect = entry.value?.fieldData;
	if (movedEffect === undefined) {
		return undefined;
	}
	if (isDetach(movedEffect)) {
		// XXX
		// moveEffects.moveKey(CrossFieldTarget.Source, movedEffect.revision, movedEffect.id, count);
	}
	return movedEffect;
}

function getMovedChangesFromBaseMark(
	moveEffects: SequenceRebaseNodeManager,
	baseMark: Mark,
): NodeId | undefined {
	return isAttach(baseMark)
		? getMovedNodeChanges(moveEffects, baseMark.revision, baseMark.id)
		: undefined;
}

function getMovedNodeChanges(
	moveEffects: SequenceRebaseNodeManager,
	revision: RevisionTag | undefined,
	localId: MoveId,
): NodeId | undefined {
	return moveEffects.getNewChangesForBaseAttach({ revision, localId }, 1).value?.nodeChange;
}

type SequenceRebaseNodeManager = RebaseNodeManager<Detach>;
