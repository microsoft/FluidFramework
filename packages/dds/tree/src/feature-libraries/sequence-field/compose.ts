/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { type IdAllocator, fail } from "../../util/index.js";
import type {
	ComposeNodeManager,
	NodeChangeComposer,
	NodeId,
} from "../modular-schema/index.js";

import { MarkListFactory } from "./markListFactory.js";
import { MarkQueue } from "./markQueue.js";
import type { NodeRangeQueryFunc } from "./moveEffectTable.js";
import {
	type CellMark,
	type Changeset,
	type Detach,
	type Mark,
	type MarkEffect,
	type MarkList,
	type NoopMark,
	NoopMarkType,
} from "./types.js";
import {
	CellOrder,
	areEqualCellIds,
	areInputCellsEmpty,
	areOutputCellsEmpty,
	cellSourcesFromMarks,
	compareCellPositionsUsingTombstones,
	extractMarkEffect,
	getDetachOutputCellId,
	getInputCellId,
	getOutputCellId,
	isAttach,
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
} from "./utils.js";
import type { ChangeAtomId, RevisionMetadataSource, RevisionTag } from "../../core/index.js";

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
	manager: ComposeNodeManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset {
	return composeMarkLists(change1, change2, composeChild, manager, revisionMetadata);
}

function composeMarkLists(
	baseMarkList: MarkList,
	newMarkList: MarkList,
	composeChild: NodeChangeComposer,
	moveEffects: ComposeNodeManager,
	revisionMetadata: RevisionMetadataSource,
): MarkList {
	const factory = new MarkListFactory();
	const queue = new ComposeQueue(baseMarkList, newMarkList, moveEffects, revisionMetadata);
	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		const settledNewMark = settleMark(newMark);
		const settledBaseMark = settleMark(baseMark);
		const composedMark = composeMarks(
			settledBaseMark,
			settledNewMark,
			composeChild,
			moveEffects,
		);
		factory.push(composedMark);
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
	moveEffects: ComposeNodeManager,
): Mark {
	const nodeChange = handleNodeChanges(baseMark, newMark, composeChild, moveEffects);
	return withNodeChange(composeMarksIgnoreChild(baseMark, newMark, moveEffects), nodeChange);
}

function composeMarksIgnoreChild(
	baseMark: Mark,
	newMark: Mark,
	moveEffects: ComposeNodeManager,
): Mark {
	if (isNoopMark(baseMark)) {
		return newMark;
	} else if (isNoopMark(newMark)) {
		return baseMark;
	}

	if (isRename(baseMark) && isRename(newMark)) {
		return { ...baseMark, idOverride: newMark.idOverride };
	} else if (isRename(baseMark)) {
		assert(isAttach(newMark), 0x9f1 /* Unexpected mark type */);
		return { ...newMark, cellId: baseMark.cellId };
	} else if (isRename(newMark)) {
		assert(isDetach(baseMark), 0x9f2 /* Unexpected mark type */);
		return { ...baseMark, idOverride: newMark.idOverride };
	}

	if (isImpactfulCellRename(newMark)) {
		assert(
			newMark.cellId !== undefined,
			0x9f3 /* Impactful cell rename must target empty cell */,
		);
		if (markEmptiesCells(baseMark)) {
			// baseMark is a detach which cancels with the attach portion of the AttachAndDetach,
			// so we are just left with the detach portion of the AttachAndDetach.
			const newDetach: CellMark<Detach> = {
				...newMark,
			};

			delete newDetach.cellId;
			return newDetach;
		}

		if (isImpactfulCellRename(baseMark)) {
			assert(
				baseMark.cellId !== undefined,
				0x9f4 /* Impactful cell rename must target empty cell */,
			);

			// XXX: Do we need to make a call to the node manager here?
			return { ...newMark, cellId: baseMark.cellId };
		}

		return newMark;
	}
	if (isImpactfulCellRename(baseMark)) {
		if (markFillsCells(newMark)) {
			return { ...newMark, cellId: baseMark.cellId };
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

		moveEffects.composeBaseAttach(
			baseMark.cellId,
			getOutputCellId(newMark),
			baseMark.count,
			newMark.changes,
		);

		if (areEqualCellIds(getOutputCellId(newMark), baseMark.cellId)) {
			// The output and input cell IDs are the same, so this mark has no effect.
			return { count: baseMark.count, cellId: baseMark.cellId };
		}
		return normalizeCellRename(baseMark.cellId, baseMark.count, attach, detach);
	} else {
		assert(baseMark.type === "Remove", "Unexpected mark type");
		moveEffects.composeDetachAttach(getDetachOutputCellId(baseMark), baseMark.count);
		return createNoopMark(baseMark.count, undefined);
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
	moveEffects: ComposeNodeManager,
): NodeId | undefined {
	if (newMark.changes !== undefined) {
		if (baseMark.type === "Insert" && baseMark.cellId !== undefined) {
			let newId: ChangeAtomId | undefined;
			if (newMark.type === "Remove") {
				newId = getDetachOutputCellId(newMark);
			}

			moveEffects.composeBaseAttach(baseMark.cellId, newId, 1, newMark.changes);
			return undefined;
		}
	}

	// TODO: Make sure composeChild is not called twice on the node changes.
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

export class ComposeQueue {
	private readonly baseMarks: MarkQueue;
	private readonly newMarks: MarkQueue;
	private readonly baseMarksCellSources: ReadonlySet<RevisionTag | undefined>;
	private readonly newMarksCellSources: ReadonlySet<RevisionTag | undefined>;

	public constructor(
		baseMarks: Changeset,
		newMarks: Changeset,
		private readonly moveEffects: ComposeNodeManager,
		private readonly revisionMetadata: RevisionMetadataSource,
	) {
		const queryFunc: NodeRangeQueryFunc = (id, count) =>
			moveEffects.getChangesForBaseDetach(id, count).length;

		this.baseMarks = new MarkQueue(baseMarks, queryFunc);
		this.newMarks = new MarkQueue(newMarks, queryFunc);
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
			fail("Should not pop when queue is empty");
		} else if (baseMark === undefined) {
			return this.dequeueNew();
		} else if (newMark === undefined) {
			return this.dequeueBase();
		} else if (areOutputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseCellId: ChangeAtomId =
				getOutputCellId(baseMark) ?? fail("Expected defined output ID");

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
			// XXX
			// this.moveEffects.onMoveIn(movedChanges);
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
	baseMark: Mark;
	newMark: Mark;
}

function getMovedChangesFromMark(
	moveEffects: ComposeNodeManager,
	markEffect: MarkEffect,
): NodeId | undefined {
	if (!isDetach(markEffect)) {
		return undefined;
	}

	// XXX: Should use the detach ID, not the mark ID
	return moveEffects.getChangesForBaseDetach(
		{ revision: markEffect.revision, localId: markEffect.id },
		1,
	).value;
}
