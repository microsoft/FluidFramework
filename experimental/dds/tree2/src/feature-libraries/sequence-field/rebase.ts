/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../util";
import { RevisionTag, TaggedChange } from "../../core";
import {
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	NodeExistenceStateChange,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isModify,
	isNewAttach,
	cloneMark,
	areInputCellsEmpty,
	getMarkLength,
	markEmptiesCells,
	markFillsCells,
	isExistingCellMark,
	getCellId,
	getOffsetAtRevision,
	compareLineages,
	getNodeChange,
	withNodeChange,
	getMarkMoveId,
	isNoopMark,
} from "./utils";
import {
	Attach,
	Changeset,
	Mark,
	MarkList,
	CellSpanningMark,
	ExistingCellMark,
	NoopMark,
	MoveId,
	Modify,
	EmptyInputCellMark,
	NoopMarkType,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { ComposeQueue } from "./compose";
import {
	getMoveEffect,
	getOrAddEffect,
	isMoveMark,
	MoveEffect,
	MoveEffectTable,
	PairedMarkUpdate,
} from "./moveEffectTable";
import { MarkQueue } from "./markQueue";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 *
 * WARNING! This implementation is incomplete:
 * - Some marks that affect existing content are removed instead of marked as conflicted when rebased over the deletion
 * of that content. This prevents us from then reinstating the mark when rebasing over the revive.
 * - Tombs are not added when rebasing an insert over a gap that is immediately left of deleted content.
 * This prevents us from being able to accurately track the position of the insert.
 * - Tiebreak ordering is not respected.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function rebase<TNodeChange>(
	change: Changeset<TNodeChange>,
	base: TaggedChange<Changeset<TNodeChange>>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	assert(base.revision !== undefined, 0x69b /* Cannot rebase over changeset with no revision */);
	const baseInfo =
		base.revision === undefined ? undefined : revisionMetadata.getInfo(base.revision);
	const baseIntention = baseInfo?.rollbackOf ?? base.revision;
	return rebaseMarkList(
		change,
		base.change,
		base.revision,
		baseIntention,
		rebaseChild,
		genId,
		manager as MoveEffectTable<TNodeChange>,
	);
}

export type NodeChangeRebaser<TNodeChange> = (
	change: TNodeChange | undefined,
	baseChange: TNodeChange | undefined,
	stateChange?: NodeExistenceStateChange,
) => TNodeChange | undefined;

function rebaseMarkList<TNodeChange>(
	currMarkList: MarkList<TNodeChange>,
	baseMarkList: MarkList<TNodeChange>,
	baseRevision: RevisionTag,
	baseIntention: RevisionTag,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects, true);
	const queue = new RebaseQueue(
		baseRevision,
		baseIntention,
		baseMarkList,
		currMarkList,
		genId,
		moveEffects,
	);

	// Each attach mark in `currMarkList` should have a lineage event added for `baseRevision` if a node adjacent to
	// the attach position was detached by `baseMarkList`.
	// At the time we process an attach we don't know whether the following node will be detached, so we record attach
	// marks which should have their lineage updated if we encounter a detach.
	const lineageRequests: LineageRequest<TNodeChange>[] = [];
	let baseDetachOffset = 0;
	// The index of (i.e., number of nodes to the left of) the base mark in the input context of the base change.
	// This assumes the base changeset is not composite (and asserts if it is).
	let baseInputIndex = 0;
	while (!queue.isEmpty()) {
		const { baseMark, newMark: currMark } = queue.pop();
		if (baseMark !== undefined && "revision" in baseMark) {
			// TODO support rebasing over composite changeset
			assert(
				baseMark.revision === baseRevision,
				0x4f3 /* Unable to keep track of the base input offset in composite changeset */,
			);
		}
		if (baseMark === undefined) {
			assert(
				currMark !== undefined,
				0x4f4 /* Non-empty queue should return at least one mark */,
			);
			if (isAttach(currMark)) {
				handleCurrAttach(
					currMark,
					factory,
					lineageRequests,
					baseDetachOffset,
					baseIntention,
				);
			} else {
				if (baseDetachOffset > 0 && baseIntention !== undefined) {
					updateLineage(lineageRequests, baseIntention);
					baseDetachOffset = 0;
				}
				factory.push(cloneMark(currMark));
			}
		} else if (currMark === undefined) {
			// TODO: Do we need to handle rebasing over baseMark's changes in this case?
			if (isDetachMark(baseMark)) {
				const detachLength = getInputLength(baseMark);
				baseDetachOffset += detachLength;
				baseInputIndex += detachLength;
			} else if (isAttach(baseMark)) {
				if (baseMark.type === "MoveIn" || baseMark.type === "ReturnTo") {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						baseMark.revision ?? baseRevision,
						baseMark.id,
					);
					if (effect.movedMark !== undefined) {
						factory.push(effect.movedMark);
						delete effect.movedMark;
					} else {
						factory.pushOffset(getOutputLength(baseMark));
					}
				} else {
					factory.pushOffset(getOutputLength(baseMark));
				}
			}
		} else {
			assert(
				!isNewAttach(baseMark) && !isNewAttach(currMark),
				0x4f5 /* A new attach cannot be at the same position as another mark */,
			);
			assert(
				getInputLength(baseMark) === getInputLength(currMark),
				0x4f6 /* The two marks should be the same size */,
			);

			const rebasedMark = rebaseMark(
				currMark,
				baseMark,
				baseRevision,
				baseIntention,
				baseInputIndex,
				rebaseChild,
				moveEffects,
			);
			factory.push(rebasedMark);

			const detachLength = getInputLength(baseMark);
			baseInputIndex += detachLength;
			if (isDetachMark(baseMark)) {
				baseDetachOffset += detachLength;
			} else {
				if (baseDetachOffset > 0 && baseIntention !== undefined) {
					updateLineage(lineageRequests, baseIntention);
				}

				lineageRequests.length = 0;
				baseDetachOffset = 0;
			}
		}
	}

	if (baseDetachOffset > 0 && baseIntention !== undefined) {
		updateLineage(lineageRequests, baseIntention);
	}

	return factory.list;
}

class RebaseQueue<T> {
	private reattachOffset: number = 0;
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;

	public constructor(
		baseRevision: RevisionTag | undefined,
		private readonly baseIntention: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		newMarks: Changeset<T>,
		genId: IdAllocator,
		moveEffects: MoveEffectTable<T>,
	) {
		this.baseMarks = new MarkQueue(baseMarks, baseRevision, moveEffects, false, genId);
		this.newMarks = new MarkQueue(newMarks, undefined, moveEffects, true, genId);
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): RebaseMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();

		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const length = getInputLength(newMark!);
			return {
				baseMark: length > 0 ? { count: length } : undefined,
				newMark: this.newMarks.tryDequeue(),
			};
		} else if (newMark === undefined) {
			const length = getInputLength(baseMark);
			if (isAttach(baseMark)) {
				this.reattachOffset += getOutputLength(baseMark);
			}
			return {
				baseMark: this.baseMarks.tryDequeue(),
				newMark: length > 0 ? { count: length } : undefined,
			};
		} else if (areInputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const cmp = compareCellPositions(
				this.baseIntention,
				baseMark,
				newMark,
				this.reattachOffset,
			);
			if (cmp < 0) {
				this.reattachOffset += Math.min(getOutputLength(baseMark), -cmp);
				return { baseMark: this.baseMarks.dequeueUpTo(-cmp) };
			} else if (cmp > 0) {
				return { newMark: this.newMarks.dequeueUpTo(cmp) };
			} else {
				const length = Math.min(getMarkLength(baseMark), getMarkLength(newMark));
				if (markFillsCells(baseMark)) {
					this.reattachOffset += length;
				}
				return this.dequeueBoth();
			}
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else if (areInputCellsEmpty(baseMark)) {
			this.reattachOffset += getOutputLength(baseMark);
			return this.dequeueBase();
		} else {
			this.reattachOffset = 0;
			return this.dequeueBoth();
		}
	}

	private dequeueBase(): RebaseMarks<T> {
		return { baseMark: this.baseMarks.dequeue() };
	}

	private dequeueNew(): RebaseMarks<T> {
		return { newMark: this.newMarks.dequeue() };
	}

	private dequeueBoth(): RebaseMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x69c /* Cannot dequeue both unless both mark queues are non-empty */,
		);
		const length = Math.min(getMarkLength(newMark), getMarkLength(baseMark));
		return {
			baseMark: this.baseMarks.dequeueUpTo(length),
			newMark: this.newMarks.dequeueUpTo(length),
		};
	}
}

/**
 * Represents the marks rebasing should process next.
 * If `baseMark` and `newMark` are both defined, then they are `SizedMark`s covering the same range of nodes.
 */
interface RebaseMarks<T> {
	baseMark?: Mark<T>;
	newMark?: Mark<T>;
}

function rebaseMark<TNodeChange>(
	currMark: CellSpanningMark<TNodeChange>,
	baseMark: CellSpanningMark<TNodeChange>,
	baseRevision: RevisionTag,
	baseIntention: RevisionTag,
	baseInputOffset: number,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
): Mark<TNodeChange> {
	let rebasedMark = rebaseNodeChange(cloneMark(currMark), baseMark, rebaseChild);
	const baseMarkIntention = getMarkIntention(baseMark, baseIntention);
	if (markEmptiesCells(baseMark)) {
		const moveId = getMarkMoveId(baseMark);
		if (moveId !== undefined) {
			if (markFollowsMoves(rebasedMark)) {
				sendMarkToDest(rebasedMark, moveEffects, baseRevision, moveId);
				return { count: 0 };
			}

			const nodeChange = getNodeChange(rebasedMark);
			if (nodeChange !== undefined) {
				rebasedMark = withNodeChange(rebasedMark, undefined);
				const modify: Modify<TNodeChange> = { type: "Modify", changes: nodeChange };
				sendMarkToDest(modify, moveEffects, baseRevision, moveId);
			}
		}

		assert(
			!isNewAttach(rebasedMark),
			0x69d /* A new attach should not be rebased over its cell being emptied */,
		);

		if (isMoveMark(rebasedMark)) {
			if (rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Destination,
					rebasedMark.revision,
					rebasedMark.id,
				).pairedMarkStatus = PairedMarkUpdate.Deactivated;
			} else if (rebasedMark.type === "ReturnTo") {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Source,
					rebasedMark.revision,
					rebasedMark.id,
				).pairedMarkStatus = PairedMarkUpdate.Reactivated;
			}
		}
		rebasedMark = makeDetachedMark(rebasedMark, baseMarkIntention, baseInputOffset);
	} else if (markFillsCells(baseMark)) {
		assert(
			isExistingCellMark(rebasedMark),
			0x69e /* Only an ExistingCellMark can target an empty cell */,
		);
		if (isMoveMark(rebasedMark)) {
			if (rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Destination,
					rebasedMark.revision,
					rebasedMark.id,
				).pairedMarkStatus = PairedMarkUpdate.Reactivated;
			} else if (rebasedMark.type === "ReturnTo") {
				getOrAddEffect(
					moveEffects,
					CrossFieldTarget.Source,
					rebasedMark.revision,
					rebasedMark.id,
				).pairedMarkStatus = PairedMarkUpdate.Deactivated;
			}
		}
		rebasedMark = withoutDetachEvent(rebasedMark);
	}
	return rebasedMark;
}

function markFollowsMoves(mark: Mark<unknown>): boolean {
	const type = mark.type;
	switch (type) {
		case "Delete":
		case "Modify":
		case "MoveOut":
		case "Revive":
			return true;
		case NoopMarkType:
		case "ReturnFrom":
		case "Insert":
		case "MoveIn":
		case "ReturnTo":
			return false;
		default:
			unreachableCase(type);
	}
}

function sendMarkToDest<T>(
	mark: Mark<T>,
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag,
	moveId: MoveId,
) {
	getOrAddEffect(moveEffects, CrossFieldTarget.Destination, revision, moveId).movedMark = mark;
}

function getMarkIntention(mark: Mark<unknown>, intention: RevisionTag): RevisionTag {
	// TODO: Use mark's revision tag when available.
	// Currently we never rebase over a composition of multiple revisions, so this isn't necessary.
	return intention;
}

function rebaseNodeChange<TNodeChange>(
	currMark: Mark<TNodeChange>,
	baseMark: Mark<TNodeChange>,
	nodeRebaser: NodeChangeRebaser<TNodeChange>,
): Mark<TNodeChange> {
	const baseChange = getNodeChange(baseMark);
	const currChange = getNodeChange<TNodeChange>(currMark);

	if (markEmptiesCells(baseMark) && !isMoveMark(baseMark)) {
		return withNodeChange(
			currMark,
			nodeRebaser(currChange, baseChange, NodeExistenceStateChange.Deleted),
		);
	} else if (markFillsCells(baseMark) && !isMoveMark(baseMark)) {
		return withNodeChange(
			currMark,
			nodeRebaser(currChange, baseChange, NodeExistenceStateChange.Revived),
		);
	}

	return withNodeChange(currMark, nodeRebaser(currChange, baseChange));
}

function makeDetachedMark<T>(
	mark: NoopMark | ExistingCellMark<T>,
	detachIntention: RevisionTag,
	offset: number,
): Mark<T> {
	if (isNoopMark(mark)) {
		return { count: 0 };
	}

	assert(mark.detachEvent === undefined, 0x69f /* Expected mark to be attached */);
	return { ...mark, detachEvent: { revision: detachIntention, index: offset } };
}

function withoutDetachEvent<T, TMark extends ExistingCellMark<T>>(mark: TMark): TMark {
	const newMark = { ...mark };
	delete newMark.detachEvent;
	delete newMark.lineage;
	return newMark;
}

export function amendRebase<TNodeChange>(
	rebasedMarks: MarkList<TNodeChange>,
	baseMarks: TaggedChange<MarkList<TNodeChange>>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	crossFieldManager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	return amendRebaseI(
		baseMarks.revision,
		baseMarks.change,
		rebasedMarks,
		rebaseChild,
		crossFieldManager as MoveEffectTable<TNodeChange>,
		revisionMetadata,
	);
}

function amendRebaseI<TNodeChange>(
	baseRevision: RevisionTag | undefined,
	baseMarks: MarkList<TNodeChange>,
	rebasedMarks: MarkList<TNodeChange>,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	// Is it correct to use ComposeQueue here?
	// If we used a special AmendRebaseQueue, we could ignore any base marks which don't have associated move-ins
	const queue = new ComposeQueue<TNodeChange>(
		baseRevision,
		baseMarks,
		undefined,
		rebasedMarks,
		() => fail("Should not generate new IDs when applying move effects"),
		moveEffects,
		revisionMetadata,
	);
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);

	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (
			baseMark !== undefined &&
			(baseMark.type === "MoveIn" || baseMark.type === "ReturnTo")
		) {
			const effect = getMoveEffect(
				moveEffects,
				CrossFieldTarget.Destination,
				baseMark.revision ?? baseRevision,
				baseMark.id,
			);
			if (effect.movedMark !== undefined) {
				factory.push(effect.movedMark);
				factory.pushOffset(-getInputLength(effect.movedMark));
				delete effect.movedMark;
			}
		}

		if (newMark !== undefined) {
			let rebasedMark = newMark;

			// TODO: Handle all pairings of base and new mark types.
			if (baseMark !== undefined && isModify(baseMark)) {
				switch (newMark.type) {
					case NoopMarkType: {
						const childChange = rebaseChild(undefined, baseMark.changes);
						if (childChange !== undefined) {
							rebasedMark = { type: "Modify", changes: childChange };
						}
						break;
					}
					case "Modify": {
						const childChange = rebaseChild(newMark.changes, baseMark.changes);
						if (childChange === undefined) {
							rebasedMark = { count: 1 };
						} else {
							newMark.changes = childChange;
						}
						break;
					}
					default:
						break;
				}
			}
			factory.push(rebasedMark);
		}
	}

	// We may have discovered new mergeable marks while applying move effects, as we may have moved a MoveOut next to another MoveOut.
	// A second pass through MarkListFactory will handle any remaining merges.
	const factory2 = new MarkListFactory<TNodeChange>(undefined, moveEffects);
	for (const mark of factory.list) {
		factory2.push(mark);
	}
	return factory2.list;
}

function handleCurrAttach<T>(
	currMark: Attach<T>,
	factory: MarkListFactory<T>,
	lineageRequests: LineageRequest<T>[],
	offset: number,
	baseIntention: RevisionTag | undefined,
) {
	const rebasedMark = cloneMark(currMark);

	// If the changeset we are rebasing over has the same intention as an event in rebasedMark's lineage,
	// we assume that the base changeset is the inverse of the changeset in the lineage, so we remove the lineage event.
	// TODO: Handle cases where the base changeset is a composition of multiple revisions.
	// TODO: Don't remove the lineage event in cases where the event isn't actually inverted by the base changeset,
	// e.g., if the inverse of the lineage event is muted after rebasing.
	if (baseIntention !== undefined) {
		tryRemoveLineageEvent(rebasedMark, baseIntention);
	}
	factory.pushContent(rebasedMark);
	lineageRequests.push({ mark: rebasedMark, offset });
}

interface LineageRequest<T> {
	mark: Attach<T>;
	offset: number;
}

function updateLineage<T>(requests: LineageRequest<T>[], revision: RevisionTag) {
	for (const request of requests) {
		const mark = request.mark;
		if (mark.lineage === undefined) {
			mark.lineage = [];
		}

		mark.lineage.push({ revision, offset: request.offset });
	}
}

function tryRemoveLineageEvent<T>(mark: Attach<T>, revisionToRemove: RevisionTag) {
	if (mark.lineage === undefined) {
		return;
	}
	const index = mark.lineage.findIndex((event) => event.revision === revisionToRemove);
	if (index >= 0) {
		mark.lineage.splice(index, 1);
		if (mark.lineage.length === 0) {
			delete mark.lineage;
		}
	}
}

/**
 * Returns a number N which encodes how the cells of the two marks are aligned.
 * - If N is zero, then the first cell of `baseMark` is the same as the first cell of `newMark`.
 * - If N is positive, then the first N cells of `newMark` (or all its cells if N is greater than its length)
 * are before the first cell of `baseMark`.
 * - If N is negative, then the first N cells of `baseMark` (or all its cells if N is greater than its length)
 * are before the first cell of `newMark`.
 */
function compareCellPositions(
	baseIntention: RevisionTag | undefined,
	baseMark: EmptyInputCellMark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	gapOffsetInBase: number,
): number {
	const baseId = getCellId(baseMark, baseIntention);
	assert(baseId !== undefined, 0x6a0 /* baseMark should have cell ID */);
	const newId = getCellId(newMark, undefined);
	if (baseId.revision === newId?.revision) {
		return baseId.index - newId.index;
	}

	if (newId !== undefined) {
		const baseOffset = getOffsetAtRevision(baseMark.lineage, newId.revision);
		if (baseOffset !== undefined) {
			// BUG: Cell offsets are not comparable to cell indices.
			return baseOffset > newId.index ? baseOffset - newId.index : -Infinity;
		}
	}

	const newOffset = getOffsetAtRevision(newMark.lineage, baseId.revision);
	if (newOffset !== undefined) {
		if (isAttach(baseMark)) {
			// BUG: This logic assumes that `baseId.revision` is the revision of the baseMark,
			// so this block should be gated on `isNewAttach(baseMark)`.
			// However, this logic happens to work in more cases than the logic after this block.
			// This should be fixed by changing LineageEvent to refer to cell IDs instead of offsets.
			const offset = newOffset - gapOffsetInBase;
			return offset === 0 ? Infinity : -offset;
		}
		// BUG: Cell offsets are not comparable to cell indices.
		return newOffset > baseId.index ? baseId.index - newOffset : Infinity;
	}

	const cmp = compareLineages(baseMark.lineage, newMark.lineage);
	if (cmp !== 0) {
		return Math.sign(cmp) * Infinity;
	}

	if (isNewAttach(newMark)) {
		// When the marks are at the same position, we use the tiebreak of `newMark`.
		// TODO: Use specified tiebreak instead of always tiebreaking left.
		return Infinity;
	}

	assert(
		isNewAttach(baseMark),
		0x6a1 /* Lineage should determine order of marks unless one is a new attach */,
	);

	// `newMark` points to cells which were emptied before `baseMark` was created.
	// We use `baseMark`'s tiebreak policy as if `newMark`'s cells were created concurrently and before `baseMark`.
	// TODO: Use specified tiebreak instead of always tiebreaking left.
	return -Infinity;
}
