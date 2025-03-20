/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { ChangeAtomId, RevisionMetadataSource, RevisionTag } from "../../core/index.js";
import { type IdAllocator, type Mutable, brand } from "../../util/index.js";
import {
	type CrossFieldManager,
	CrossFieldTarget,
	type NodeChangeRebaser,
	NodeAttachState,
	type NodeId,
	type RebaseRevisionMetadata,
} from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import { MarkQueue } from "./markQueue.js";
import {
	type MoveEffect,
	type MoveEffectTable,
	getMoveEffect,
	isMoveIn,
	isMoveMark,
	isMoveOut,
	setMoveEffect,
} from "./moveEffectTable.js";
import {
	type CellId,
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	type MarkList,
	type MoveId,
	type MoveIn,
	type MoveOut,
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
	getEndpoint,
	getInputCellId,
	isAttachAndDetachEffect,
	isDetach,
	isNewAttach,
	isRename,
	isTombstone,
	markEmptiesCells,
	markFillsCells,
	splitMarkEffect,
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
	manager: CrossFieldManager,
	revisionMetadata: RebaseRevisionMetadata,
): Changeset {
	return rebaseMarkList(
		change,
		base,
		revisionMetadata,
		rebaseChild,
		genId,
		manager as MoveEffectTable,
	);
}

function rebaseMarkList(
	currMarkList: MarkList,
	baseMarkList: MarkList,
	metadata: RebaseRevisionMetadata,
	rebaseChild: NodeChangeRebaser,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect>,
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
		private readonly moveEffects: MoveEffectTable,
	) {
		this.baseMarks = new MarkQueue(baseMarks, moveEffects);
		this.newMarks = new MarkQueue(newMarks, moveEffects);
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
	if (isMoveIn(mark) && isMoveOut(effect)) {
		return { ...mark, type: "Insert" };
	} else if (isRename(mark) && isMoveOut(effect)) {
		return { ...effect, count: mark.count, idOverride: mark.idOverride };
	} else if (isAttachAndDetachEffect(mark) && isMoveIn(mark.attach) && isMoveOut(effect)) {
		return { ...mark.detach, count: mark.count };
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
	moveEffects: MoveEffectTable,
): Mark {
	const rebasedMark = rebaseNodeChange(cloneMark(currMark), baseMark, rebaseChild);
	const movedNodeChanges = getMovedChangesFromBaseMark(moveEffects, baseMark);
	if (movedNodeChanges !== undefined) {
		assert(
			rebasedMark.changes === undefined,
			0x8dc /* Unexpected collision of new node changes */,
		);
		rebasedMark.changes = movedNodeChanges;
		moveEffects.onMoveIn(movedNodeChanges);
	}

	return rebaseMarkIgnoreChild(rebasedMark, baseMark, moveEffects);
}

function rebaseMarkIgnoreChild(
	currMark: Mark,
	baseMark: Mark,
	moveEffects: MoveEffectTable,
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

		if (isMoveOut(baseMark)) {
			assert(isMoveMark(baseMark), 0x6f0 /* Only move marks have move IDs */);
			assert(
				!isNewAttach(currMark),
				0x819 /* New attaches should not be rebased over moves */,
			);
			const { remains, follows } = separateEffectsForMove(extractMarkEffect(currMark));
			if (follows !== undefined) {
				sendEffectToDest(follows, moveEffects, getEndpoint(baseMark), baseMark.count);
			}

			if (currMark.changes !== undefined) {
				moveRebasedChanges(currMark.changes, moveEffects, getEndpoint(baseMark));
			}
			rebasedMark = { ...(remains ?? {}), count: baseMark.count };
		} else {
			rebasedMark = currMark;
		}
		rebasedMark = makeDetachedMark(rebasedMark, cloneCellId(baseCellId));
	} else if (markFillsCells(baseMark)) {
		rebasedMark = isAttachAndDetachEffect(currMark)
			? withNodeChange({ ...currMark.detach, count: currMark.count }, currMark.changes)
			: withCellId(currMark, undefined);
	} else if (isAttachAndDetachEffect(baseMark)) {
		assert(
			baseMark.cellId !== undefined,
			0x81a /* AttachAndDetach mark should target an empty cell */,
		);
		const halfRebasedMark = rebaseMarkIgnoreChild(
			currMark,
			{ ...baseMark.attach, cellId: cloneCellId(baseMark.cellId), count: baseMark.count },
			moveEffects,
		);
		rebasedMark = rebaseMarkIgnoreChild(
			halfRebasedMark,
			{ ...baseMark.detach, count: baseMark.count },
			moveEffects,
		);
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
		case "Remove":
		case "MoveOut": {
			// There are two scenarios that lead to a Detach mark having an idOverride:
			// 1. The detach is a rollback (the idOverride the original id that the cell had in the input context of the attach being rolled back).
			// 2. The detach has been composed with a Rename (the idOverride is the cell id in the output context of the rename).
			// Since rollbacks are never rebased, we can safely assume that the idOverride is due to a Rename (scenario #2).
			// While the detach must follow the node that it targets, the rename must remain in place because it targets the cell.
			if (mark.idOverride !== undefined) {
				const remains: MarkEffect = { type: "Rename", idOverride: mark.idOverride };
				const follows: Mutable<MarkEffect> = { ...mark };
				delete follows.idOverride;
				return { remains, follows };
			}
			return { follows: mark };
		}
		case "AttachAndDetach":
			return { follows: mark.detach, remains: mark.attach };
		case "MoveIn":
		case "Rename":
			return { remains: mark };
		case NoopMarkType:
			return {};
		case "Insert": {
			const follows: MoveOut = {
				type: "MoveOut",
				id: mark.id,
			};
			const remains: MoveIn = {
				type: "MoveIn",
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

// TODO: Reduce the duplication between this and other MoveEffect helpers
function sendEffectToDest(
	markEffect: Detach,
	moveEffects: MoveEffectTable,
	{ revision, localId: id }: ChangeAtomId,
	count: number,
): void {
	const effect = getMoveEffect(
		moveEffects,
		CrossFieldTarget.Destination,
		revision,
		id,
		count,
		false,
	);
	if (effect.length < count) {
		const [markEffect1, markEffect2] = splitMarkEffect(markEffect, effect.length);
		const newEffect =
			effect.value !== undefined
				? { ...effect.value, movedMark: markEffect1 }
				: { movedMark: markEffect1 };
		setMoveEffect(
			moveEffects,
			CrossFieldTarget.Destination,
			revision,
			id,
			effect.length,
			newEffect,
		);
		sendEffectToDest(
			markEffect2,
			moveEffects,
			{ revision, localId: brand(id + effect.length) },
			count - effect.length,
		);
	} else {
		const newEffect: MoveEffect =
			effect.value !== undefined
				? { ...effect.value, movedEffect: markEffect }
				: { movedEffect: markEffect };
		setMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count, newEffect);
	}
}

function moveRebasedChanges(
	nodeChange: NodeId,
	moveEffects: MoveEffectTable,
	{ revision, localId: id }: ChangeAtomId,
): void {
	const effect = getMoveEffect(
		moveEffects,
		CrossFieldTarget.Destination,
		revision,
		id,
		1,
		false,
	).value;

	const newEffect =
		effect !== undefined
			? { ...effect, rebasedChanges: nodeChange }
			: { rebasedChanges: nodeChange };

	setMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, 1, newEffect);
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
	moveEffects: MoveEffectTable,
	baseMark: Mark,
): Detach | undefined {
	if (isMoveIn(baseMark)) {
		return getMovedEffect(moveEffects, baseMark.revision, baseMark.id, baseMark.count);
	} else if (isAttachAndDetachEffect(baseMark) && isMoveIn(baseMark.attach)) {
		return getMovedEffect(
			moveEffects,
			baseMark.attach.revision,
			baseMark.attach.id,
			baseMark.count,
		);
	} else {
		return undefined;
	}
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getMovedEffect(
	moveEffects: MoveEffectTable,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): Detach | undefined {
	const effect = getMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count);
	assert(effect.length === count, 0x6f3 /* Expected effect to cover entire mark */);
	const movedEffect = effect.value?.movedEffect;
	if (movedEffect === undefined) {
		return undefined;
	}
	if (isMoveOut(movedEffect)) {
		moveEffects.moveKey(CrossFieldTarget.Source, movedEffect.revision, movedEffect.id, count);
	}
	return movedEffect;
}

function getMovedChangesFromBaseMark(
	moveEffects: MoveEffectTable,
	baseMark: Mark,
): NodeId | undefined {
	if (isMoveIn(baseMark)) {
		return getMovedNodeChanges(moveEffects, baseMark.revision, baseMark.id, baseMark.count);
	} else if (isAttachAndDetachEffect(baseMark) && isMoveIn(baseMark.attach)) {
		return getMovedNodeChanges(
			moveEffects,
			baseMark.attach.revision,
			baseMark.attach.id,
			baseMark.count,
		);
	} else {
		return undefined;
	}
}

function getMovedNodeChanges(
	moveEffects: MoveEffectTable,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): NodeId | undefined {
	return getMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count).value
		?.rebasedChanges;
}
