/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type RevisionMetadataSource,
	type RevisionTag,
	offsetChangeAtomId,
} from "../../core/index.js";
import { type IdAllocator, fail } from "../../util/index.js";
import {
	type CrossFieldManager,
	CrossFieldTarget,
	type NodeChangeComposer,
	type NodeId,
} from "../modular-schema/index.js";

import type { MoveMarkEffect } from "./helperTypes.js";
import { MarkListFactory } from "./markListFactory.js";
import { MarkQueue } from "./markQueue.js";
import {
	type MoveEffect,
	type MoveEffectTable,
	getCrossFieldTargetFromMove,
	getMoveEffect,
	getMoveIn,
	isMoveIn,
	isMoveMark,
	isMoveOut,
	setMoveEffect,
} from "./moveEffectTable.js";
import {
	type Attach,
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
	areEqualCellIds,
	areInputCellsEmpty,
	areOutputCellsEmpty,
	asAttachAndDetach,
	cellSourcesFromMarks,
	compareCellPositionsUsingTombstones,
	extractMarkEffect,
	getEndpoint,
	getInputCellId,
	getOutputCellId,
	isAttach,
	isAttachAndDetachEffect,
	isDetach,
	isImpactfulCellRename,
	isNewAttach,
	isNoopMark,
	isRename,
	markEmptiesCells,
	markFillsCells,
	markHasCellEffect,
	normalizeCellRename,
	settleMark,
	withNodeChange,
	withRevision,
} from "./utils.js";

/**
 * Composes a sequence of changesets into a single changeset.
 * @param changes - The changesets to be applied.
 * Parts of the input may be reused in the output, but the input is not mutated.
 * Each changeset in the list is assumed to be applicable after the previous one.
 * @returns A changeset that is equivalent to applying each of the given `changes` in order.
 *
 * WARNING! This implementation is incomplete:
 * - Tombstone information is ignored.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function compose(
	change1: Changeset,
	change2: Changeset,
	composeChild: NodeChangeComposer,
	_genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset {
	return composeMarkLists(
		change1,
		change2,
		composeChild,
		manager as MoveEffectTable,
		revisionMetadata,
	);
}

function composeMarkLists(
	baseMarkList: MarkList,
	newMarkList: MarkList,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
	revisionMetadata: RevisionMetadataSource,
): MarkList {
	const factory = new MarkListFactory();
	const queue = new ComposeQueue(baseMarkList, newMarkList, moveEffects, revisionMetadata);
	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(
				composeMark(baseMark, moveEffects, (node: NodeId) =>
					composeChildChanges(node, undefined, composeChild),
				),
			);
		} else {
			// We only compose changesets that will not be further rebased.
			// It is therefore safe to remove any intentions that have no impact in the context they apply to.
			const settledNewMark = settleMark(newMark);
			if (baseMark === undefined) {
				factory.push(
					composeMark(settledNewMark, moveEffects, (node: NodeId) =>
						composeChildChanges(undefined, node, composeChild),
					),
				);
			} else {
				// Past this point, we are guaranteed that `settledNewMark` and `baseMark` have the same length and
				// start at the same location in the revision after the base changes.
				// They therefore refer to the same range for that revision.
				const settledBaseMark = settleMark(baseMark);
				const composedMark = composeMarks(
					settledBaseMark,
					settledNewMark,
					composeChild,
					moveEffects,
				);
				factory.push(composedMark);
			}
		}
	}

	return factory.list;
}

/**
 * Composes two marks where `newMark` is based on the state produced by `baseMark`.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @param newRev - The revision the new mark is part of.
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks(
	baseMark: Mark,
	newMark: Mark,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
): Mark {
	const nodeChange = handleNodeChanges(baseMark, newMark, composeChild, moveEffects);

	return withUpdatedEndpoint(
		withNodeChange(composeMarksIgnoreChild(baseMark, newMark, moveEffects), nodeChange),
		baseMark.count,
		moveEffects,
	);
}

function composeMarksIgnoreChild(
	baseMark: Mark,
	newMark: Mark,
	moveEffects: MoveEffectTable,
): Mark {
	if (isNoopMark(baseMark)) {
		return newMark;
	} else if (isNoopMark(newMark)) {
		return baseMark;
	}

	if (isRename(baseMark) && isRename(newMark)) {
		return { ...baseMark, idOverride: newMark.idOverride };
	} else if (isRename(baseMark)) {
		assert(
			isAttach(newMark) || isAttachAndDetachEffect(newMark),
			0x9f1 /* Unexpected mark type */,
		);
		return { ...newMark, cellId: baseMark.cellId };
	} else if (isRename(newMark)) {
		assert(
			isDetach(baseMark) || isAttachAndDetachEffect(baseMark),
			0x9f2 /* Unexpected mark type */,
		);
		return isDetach(baseMark)
			? { ...baseMark, idOverride: newMark.idOverride }
			: { ...baseMark, detach: { ...baseMark.detach, idOverride: newMark.idOverride } };
	}

	if (isImpactfulCellRename(newMark)) {
		const newAttachAndDetach = asAttachAndDetach(newMark);
		assert(
			newAttachAndDetach.cellId !== undefined,
			0x9f3 /* Impactful cell rename must target empty cell */,
		);
		const newDetachRevision = newAttachAndDetach.detach.revision;
		if (markEmptiesCells(baseMark)) {
			// baseMark is a detach which cancels with the attach portion of the AttachAndDetach,
			// so we are just left with the detach portion of the AttachAndDetach.
			const newDetach: CellMark<Detach> = {
				...newAttachAndDetach.detach,
				count: baseMark.count,
			};

			if (isMoveIn(newAttachAndDetach.attach) && isMoveOut(newAttachAndDetach.detach)) {
				assert(isMoveOut(baseMark), 0x808 /* Unexpected mark type */);

				// The base changeset and new changeset both move these nodes.
				// Call the original position of the nodes A, the position after the base changeset is applied B,
				// and the position after the new changeset is applied C.
				// The new changeset moves the nodes from B, temporarily returns them to A, and then moves them to C.
				// The composition of the base and new changesets will be a move directly from A to C,
				// since the move from A to B cancels out with the return from B to A.
				// This if-block is handling marks at A.
				// When we compose the marks at B we will link the start of the base move (A to B)
				// with the end of the new move (B to C).
				// Because we are replacing the mark representing the start of the move with the new changeset's
				// move-out from A, we update the base move-in at B to consider that its start point.
				const newDetachId = {
					revision: newDetachRevision,
					localId: newAttachAndDetach.detach.id,
				};

				setTruncatedEndpointForInner(
					moveEffects,
					CrossFieldTarget.Destination,
					getEndpoint(baseMark),
					baseMark.count,
					newDetachId,
				);

				const newEndpoint = getComposedEndpoint(
					moveEffects,
					CrossFieldTarget.Source,
					baseMark.revision,
					baseMark.id,
					baseMark.count,
				);

				if (newEndpoint !== undefined) {
					changeFinalEndpoint(newDetach as MoveMarkEffect, newEndpoint);
					setTruncatedEndpoint(
						moveEffects,
						CrossFieldTarget.Destination,
						newEndpoint,
						baseMark.count,
						newDetachId,
					);
				}
			}

			return newDetach;
		}

		if (isImpactfulCellRename(baseMark)) {
			assert(
				baseMark.cellId !== undefined,
				0x9f4 /* Impactful cell rename must target empty cell */,
			);
			const baseAttachAndDetach = asAttachAndDetach(baseMark);
			const newOutputId = getOutputCellId(newAttachAndDetach);

			const originalAttach = { ...baseAttachAndDetach.attach };
			const finalDetach = { ...newAttachAndDetach.detach };

			handleMovePivot(baseMark.count, originalAttach, finalDetach, moveEffects);

			if (areEqualCellIds(newOutputId, baseAttachAndDetach.cellId)) {
				return { count: baseAttachAndDetach.count, cellId: baseAttachAndDetach.cellId };
			}

			// `newMark`'s attach portion cancels with `baseMark`'s detach portion.
			const detachRevision = finalDetach.revision;
			if (detachRevision !== undefined) {
				finalDetach.revision = detachRevision;
			}

			return normalizeCellRename(baseMark.cellId, baseMark.count, originalAttach, finalDetach);
		}

		return normalizeCellRename(
			newAttachAndDetach.cellId,
			newAttachAndDetach.count,
			newAttachAndDetach.attach,
			newAttachAndDetach.detach,
		);
	}
	if (isImpactfulCellRename(baseMark)) {
		const baseAttachAndDetach = asAttachAndDetach(baseMark);
		if (markFillsCells(newMark)) {
			const originalAttach = withRevision(
				{
					...baseAttachAndDetach.attach,
					cellId: baseAttachAndDetach.cellId,
					count: baseAttachAndDetach.count,
				},
				baseAttachAndDetach.attach.revision,
			);

			if (isMoveIn(baseAttachAndDetach.attach) && isMoveOut(baseAttachAndDetach.detach)) {
				assert(isMoveIn(newMark), 0x809 /* Unexpected mark type */);

				const originalAttachId = {
					revision: baseAttachAndDetach.attach.revision,
					localId: baseAttachAndDetach.attach.id,
				};

				setTruncatedEndpointForInner(
					moveEffects,
					CrossFieldTarget.Source,
					getEndpoint(newMark),
					baseAttachAndDetach.count,
					originalAttachId,
				);

				const newEndpoint = getComposedEndpoint(
					moveEffects,
					CrossFieldTarget.Destination,
					newMark.revision,
					newMark.id,
					newMark.count,
				);

				if (newEndpoint !== undefined) {
					changeFinalEndpoint(originalAttach as MoveMarkEffect, newEndpoint);
					setTruncatedEndpoint(
						moveEffects,
						CrossFieldTarget.Source,
						newEndpoint,
						baseMark.count,
						originalAttachId,
					);
				}
			}

			return originalAttach;
		} else {
			// Other mark types have been handled by previous conditional branches.
			assert(newMark.type === NoopMarkType, 0x80a /* Unexpected mark type */);
			return baseMark;
		}
	}

	if (!markHasCellEffect(baseMark) && !markHasCellEffect(newMark)) {
		return createNoopMark(newMark.count, undefined, getInputCellId(baseMark));
	} else if (!markHasCellEffect(baseMark)) {
		return newMark;
	} else if (!markHasCellEffect(newMark)) {
		return baseMark;
	} else if (areInputCellsEmpty(baseMark)) {
		assert(isDetach(newMark), 0x71c /* Unexpected mark type */);
		assert(isAttach(baseMark), 0x71d /* Expected generative mark */);

		const attach = extractMarkEffect(baseMark);
		const detach = extractMarkEffect(newMark);

		handleMovePivot(baseMark.count, attach, detach, moveEffects);

		if (areEqualCellIds(getOutputCellId(newMark), baseMark.cellId)) {
			// The output and input cell IDs are the same, so this mark has no effect.
			return { count: baseMark.count, cellId: baseMark.cellId };
		}
		return normalizeCellRename(baseMark.cellId, baseMark.count, attach, detach);
	} else {
		const length = baseMark.count;
		return createNoopMark(length, undefined);
	}
}

/**
 * Checks if `baseAttach` and `newDetach` are both moves, and if so updates their move endpoints as appropriate,
 * and removes their `finalEndpoint` endpoint fields. Note that can mutate `baseAttach` and `newDetach`.
 * If the effects are not both moves this function does nothing.
 * @param count - The number of cells targeted
 * @param baseAttach - The base attach effect at this location
 * @param newDetach - The new detach effect at this location
 */
function handleMovePivot(
	count: number,
	baseAttach: Attach,
	newDetach: Detach,
	moveEffects: MoveEffectTable,
): void {
	if (isMoveIn(baseAttach) && isMoveOut(newDetach)) {
		const finalSource = getEndpoint(baseAttach);
		const finalDest = getEndpoint(newDetach);

		setEndpoint(moveEffects, CrossFieldTarget.Source, finalSource, count, finalDest);

		const truncatedEndpoint1 = getTruncatedEndpointForInner(
			moveEffects,
			CrossFieldTarget.Destination,
			baseAttach.revision,
			baseAttach.id,
			count,
		);

		if (truncatedEndpoint1 !== undefined) {
			setTruncatedEndpoint(
				moveEffects,
				CrossFieldTarget.Destination,
				finalDest,
				count,
				truncatedEndpoint1,
			);
		}

		setEndpoint(moveEffects, CrossFieldTarget.Destination, finalDest, count, finalSource);

		const truncatedEndpoint2 = getTruncatedEndpointForInner(
			moveEffects,
			CrossFieldTarget.Source,
			newDetach.revision,
			newDetach.id,
			count,
		);

		if (truncatedEndpoint2 !== undefined) {
			setTruncatedEndpoint(
				moveEffects,
				CrossFieldTarget.Source,
				finalSource,
				count,
				truncatedEndpoint2,
			);
		}

		// The `finalEndpoint` field of AttachAndDetach move effect pairs is not used,
		// so we remove it as a normalization.
		delete baseAttach.finalEndpoint;
		delete newDetach.finalEndpoint;
	}
}

function createNoopMark(
	length: number,
	nodeChange: NodeId | undefined,
	cellId?: ChangeAtomId,
): Mark {
	const mark: CellMark<NoopMark> = { count: length };
	if (nodeChange !== undefined) {
		assert(length === 1, 0x692 /* A mark with a node change must have length one */);
		mark.changes = nodeChange;
	}
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function handleNodeChanges(
	baseMark: Mark,
	newMark: Mark,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
): NodeId | undefined {
	if (newMark.changes !== undefined) {
		const baseSource = getMoveIn(baseMark);

		// TODO: Make sure composeChild is not called twice on the node changes.
		if (baseSource !== undefined) {
			setModifyAfter(moveEffects, getEndpoint(baseSource), newMark.changes);
			return undefined;
		}
	}

	return composeChildChanges(baseMark.changes, newMark.changes, composeChild);
}

function composeChildChanges(
	baseChange: NodeId | undefined,
	newChange: NodeId | undefined,
	composeChild: NodeChangeComposer,
): NodeId | undefined {
	if (baseChange === undefined && newChange === undefined) {
		return undefined;
	}

	return composeChild(baseChange, newChange);
}

function composeMark<TMark extends Mark>(
	mark: TMark,
	moveEffects: MoveEffectTable,
	composeChild: (node: NodeId) => NodeId | undefined,
): TMark {
	const nodeChanges = mark.changes !== undefined ? composeChild(mark.changes) : undefined;
	const updatedMark = withUpdatedEndpoint(mark, mark.count, moveEffects);
	return withNodeChange(updatedMark, nodeChanges);
}

export class ComposeQueue {
	private readonly baseMarks: MarkQueue;
	private readonly newMarks: MarkQueue;
	private readonly baseMarksCellSources: ReadonlySet<RevisionTag | undefined>;
	private readonly newMarksCellSources: ReadonlySet<RevisionTag | undefined>;

	public constructor(
		baseMarks: Changeset,
		newMarks: Changeset,
		private readonly moveEffects: MoveEffectTable,
		private readonly revisionMetadata: RevisionMetadataSource,
	) {
		this.baseMarks = new MarkQueue(baseMarks, moveEffects);
		this.newMarks = new MarkQueue(newMarks, moveEffects);
		this.baseMarksCellSources = cellSourcesFromMarks(baseMarks, getOutputCellId);
		this.newMarksCellSources = cellSourcesFromMarks(newMarks, getInputCellId);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): ComposeMarks {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			return this.dequeueNew();
		} else if (newMark === undefined) {
			return this.dequeueBase();
		} else if (areOutputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseCellId: ChangeAtomId =
				getOutputCellId(baseMark) ?? fail(0xb29 /* Expected defined output ID */);

			if (markEmptiesCells(baseMark) && baseCellId.revision === undefined) {
				// The base revision should always be defined except when squashing changes into a transaction.
				// In the future, we want to support reattaches in the new change here.
				// We will need to be able to order the base mark relative to the new mark
				// (which requires the local changes to have a revision tag))
				assert(
					isNewAttach(newMark),
					0x695 /* TODO: Assign revision tags to each change in a transaction */,
				);
				return this.dequeueNew();
			}

			const newCellId = getInputCellId(newMark);
			assert(newCellId !== undefined, 0x89d /* Both marks should have cell IDs */);
			const comparison = compareCellPositionsUsingTombstones(
				baseCellId,
				newCellId,
				this.baseMarksCellSources,
				this.newMarksCellSources,
				this.revisionMetadata,
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
		} else if (areOutputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else {
			return this.dequeueBoth();
		}
	}

	private dequeueBase(length: number = Number.POSITIVE_INFINITY): ComposeMarks {
		const baseMark = this.baseMarks.dequeueUpTo(length);
		const movedChanges = getMovedChangesFromMark(this.moveEffects, baseMark);
		if (movedChanges !== undefined) {
			this.moveEffects.onMoveIn(movedChanges);
		}

		const newMark = createNoopMark(baseMark.count, movedChanges, getOutputCellId(baseMark));
		return { baseMark, newMark };
	}

	private dequeueNew(length: number = Number.POSITIVE_INFINITY): ComposeMarks {
		const newMark = this.newMarks.dequeueUpTo(length);
		const baseMark = createNoopMark(newMark.count, undefined, getInputCellId(newMark));

		return {
			baseMark,
			newMark,
		};
	}

	private dequeueBoth(): ComposeMarks {
		const length = this.peekMinLength();
		const baseMark = this.baseMarks.dequeueUpTo(length);
		let newMark = this.newMarks.dequeueUpTo(length);
		const movedChanges = getMovedChangesFromMark(this.moveEffects, baseMark);

		if (movedChanges !== undefined) {
			assert(newMark.changes === undefined, 0x8da /* Unexpected node changeset collision */);
			newMark = withNodeChange(newMark, movedChanges);
		}

		return {
			baseMark,
			newMark,
		};
	}

	private peekMinLength(): number {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x8db /* Cannot peek length unless both mark queues are non-empty */,
		);

		return Math.min(newMark.count, baseMark.count);
	}
}

interface ComposeMarks {
	baseMark?: Mark;
	newMark?: Mark;
}

function getMovedChangesFromMark(
	moveEffects: MoveEffectTable,
	markEffect: MarkEffect,
): NodeId | undefined {
	if (isAttachAndDetachEffect(markEffect)) {
		return getMovedChangesFromMark(moveEffects, markEffect.detach);
	}
	if (!isMoveOut(markEffect)) {
		return undefined;
	}

	return getModifyAfter(moveEffects, markEffect.revision, markEffect.id);
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getModifyAfter(
	moveEffects: MoveEffectTable,
	revision: RevisionTag | undefined,
	id: MoveId,
): NodeId | undefined {
	const target = CrossFieldTarget.Source;
	const effect = getMoveEffect(moveEffects, target, revision, id, 1);

	if (effect.value?.modifyAfter !== undefined) {
		return effect.value.modifyAfter;
	}

	return undefined;
}

// TODO: Reduce the duplication between this and other MoveEffect helpers
function setModifyAfter(
	moveEffects: MoveEffectTable,
	{ revision, localId: id }: ChangeAtomId,
	modifyAfter: NodeId,
): void {
	const target = CrossFieldTarget.Source;
	const count = 1;
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	const newEffect: MoveEffect =
		effect.value !== undefined ? { ...effect.value, modifyAfter } : { modifyAfter };
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

function setEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	endpoint: ChangeAtomId,
): void {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count, false);
	const newEffect = effect.value !== undefined ? { ...effect.value, endpoint } : { endpoint };
	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setEndpoint(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(endpoint, effect.length),
		);
	}
}

function setTruncatedEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	truncatedEndpoint: ChangeAtomId,
): void {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
	const newEffect =
		effect.value !== undefined
			? { ...effect.value, truncatedEndpoint }
			: { truncatedEndpoint };

	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setTruncatedEndpoint(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(truncatedEndpoint, effect.length),
		);
	}
}

function setTruncatedEndpointForInner(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	truncatedEndpointForInner: ChangeAtomId,
): void {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
	const newEffect =
		effect.value !== undefined
			? { ...effect.value, truncatedEndpointForInner }
			: { truncatedEndpointForInner };
	setMoveEffect(moveEffects, target, id.revision, id.localId, effect.length, newEffect);

	const remainingCount = count - effect.length;
	if (remainingCount > 0) {
		setTruncatedEndpointForInner(
			moveEffects,
			target,
			offsetChangeAtomId(id, effect.length),
			remainingCount,
			offsetChangeAtomId(truncatedEndpointForInner, effect.length),
		);
	}
}

function withUpdatedEndpoint<TMark extends MarkEffect>(
	mark: TMark,
	count: number,
	effects: MoveEffectTable,
): TMark {
	if (isAttachAndDetachEffect(mark)) {
		return {
			...mark,
			attach: withUpdatedEndpoint(mark.attach, count, effects),
			detach: withUpdatedEndpoint(mark.detach, count, effects),
		};
	}

	if (!isMoveMark(mark)) {
		return mark;
	}
	const finalDest = getComposedEndpoint(
		effects,
		getCrossFieldTargetFromMove(mark),
		mark.revision,
		mark.id,
		count,
	);

	if (finalDest === undefined) {
		return mark;
	}

	const output = { ...mark };
	changeFinalEndpoint(output, finalDest);

	return output;
}

function changeFinalEndpoint(mark: MoveMarkEffect, endpoint: ChangeAtomId): void {
	if (areEqualCellIds(endpoint, { revision: mark.revision, localId: mark.id })) {
		delete mark.finalEndpoint;
	} else {
		mark.finalEndpoint = endpoint;
	}
}

function getComposedEndpoint(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): ChangeAtomId | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, 0x815 /* Expected effect to cover entire mark */);
	return effect.value?.truncatedEndpoint ?? effect.value?.endpoint;
}

function getTruncatedEndpointForInner(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): ChangeAtomId | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, 0x934 /* Expected effect to cover entire mark */);
	return effect.value?.truncatedEndpointForInner;
}
