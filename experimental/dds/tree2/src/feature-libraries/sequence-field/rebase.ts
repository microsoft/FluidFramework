/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../util";
import { RevisionTag, TaggedChange } from "../../core";
import {
	ChangesetLocalId,
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	NodeExistenceState,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isNewAttach,
	cloneMark,
	areInputCellsEmpty,
	getMarkLength,
	markEmptiesCells,
	markFillsCells,
	isExistingCellMark,
	getCellId,
	getOffsetInCellRange,
	compareLineages,
	getNodeChange,
	withNodeChange,
	getMarkMoveId,
	isNoopMark,
	areOverlappingIdRanges,
} from "./utils";
import {
	Changeset,
	Mark,
	MarkList,
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
	setMoveEffect,
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
	nodeExistenceState: NodeExistenceState = NodeExistenceState.Alive,
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
		nodeExistenceState,
	);
}

export type NodeChangeRebaser<TNodeChange> = (
	change: TNodeChange | undefined,
	baseChange: TNodeChange | undefined,
	stateChange?: NodeExistenceState,
) => TNodeChange | undefined;

function rebaseMarkList<TNodeChange>(
	currMarkList: MarkList<TNodeChange>,
	baseMarkList: MarkList<TNodeChange>,
	baseRevision: RevisionTag,
	baseIntention: RevisionTag,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
	nodeExistenceState: NodeExistenceState,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();
	const queue = new RebaseQueue(
		baseRevision,
		baseIntention,
		baseMarkList,
		currMarkList,
		genId,
		moveEffects,
	);

	// Each mark with empty input cells in `currMarkList` should have a lineage event added for all adjacent detaches in the base changeset.
	// At the time we process an attach we don't know about detaches of later nodes,
	// so we record marks which should have their lineage updated if we encounter a detach.
	const lineageRecipients: Mark<TNodeChange>[] = [];

	// List of IDs of detaches encountered in the base changeset which are adjacent to the current position.
	const lineageEntries: IdRange[] = [];
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
			if (areInputCellsEmpty(currMark)) {
				const rebasedMark = cloneMark(currMark);
				handleLineage(rebasedMark, lineageRecipients, lineageEntries, baseIntention);
				factory.push(rebasedMark);
			} else {
				factory.push(cloneMark(currMark));
			}
		} else if (currMark === undefined) {
			if (markEmptiesCells(baseMark)) {
				assert(isDetachMark(baseMark), "Only detach marks should empty cells");
				lineageEntries.push({ id: baseMark.id, count: baseMark.count });
			} else if (isAttach(baseMark)) {
				if (baseMark.type === "MoveIn" || baseMark.type === "ReturnTo") {
					const movedMark = getMovedMark(
						moveEffects,
						baseMark.revision ?? baseRevision,
						baseMark.id,
						baseMark.count,
					);
					if (movedMark !== undefined) {
						factory.push(movedMark);
					} else {
						factory.pushOffset(getOutputLength(baseMark));
					}
				} else {
					factory.pushOffset(getOutputLength(baseMark));
				}
				lineageRecipients.length = 0;
				lineageEntries.length = 0;
			}
		} else {
			assert(
				getInputLength(baseMark) === getInputLength(currMark),
				0x4f6 /* The two marks should be the same size */,
			);

			const rebasedMark = rebaseMark(
				currMark,
				baseMark,
				baseRevision,
				baseIntention,
				rebaseChild,
				moveEffects,
				nodeExistenceState,
			);

			// Note that we first add lineage for `baseMark` to `lineageRecipients`, then handle adding lineage to `rebasedMark`,
			// then add `baseMark` to `lineageEntries` so that `rebasedMark` does not get an entry for `baseMark`.
			// `rebasedMark` should already have a detach event for `baseMark`.
			if (markEmptiesCells(baseMark)) {
				assert(isDetachMark(baseMark), "Only detach marks should empty cells");
				addLineageToRecipients(
					lineageRecipients,
					baseIntention,
					baseMark.id,
					baseMark.count,
				);
			}

			if (areInputCellsEmpty(rebasedMark)) {
				handleLineage(rebasedMark, lineageRecipients, lineageEntries, baseIntention);
			}
			factory.push(rebasedMark);

			if (markEmptiesCells(baseMark)) {
				assert(isDetachMark(baseMark), "Only detach marks should empty cells");
				lineageEntries.push({ id: baseMark.id, count: baseMark.count });
			} else {
				lineageRecipients.length = 0;
				lineageEntries.length = 0;
			}
		}
	}

	return factory.list;
}

interface IdRange {
	id: ChangesetLocalId;
	count: number;
}

class RebaseQueue<T> {
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
			return {
				baseMark: this.baseMarks.tryDequeue(),
				newMark: length > 0 ? { count: length } : undefined,
			};
		} else if (areInputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const cmp = compareCellPositions(this.baseIntention, baseMark, newMark);
			if (cmp < 0) {
				return { baseMark: this.baseMarks.dequeueUpTo(-cmp) };
			} else if (cmp > 0) {
				return { newMark: this.newMarks.dequeueUpTo(cmp) };
			} else {
				return this.dequeueBoth();
			}
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else if (areInputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else {
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
	currMark: Mark<TNodeChange>,
	baseMark: Mark<TNodeChange>,
	baseRevision: RevisionTag,
	baseIntention: RevisionTag,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
	nodeExistenceState: NodeExistenceState,
): Mark<TNodeChange> {
	let rebasedMark = rebaseNodeChange(cloneMark(currMark), baseMark, rebaseChild);
	const baseMarkIntention = getMarkIntention(baseMark, baseIntention);
	if (markEmptiesCells(baseMark)) {
		const moveId = getMarkMoveId(baseMark);
		if (moveId !== undefined) {
			assert(isMoveMark(baseMark), 0x6f0 /* Only move marks have move IDs */);
			if (markFollowsMoves(rebasedMark)) {
				sendMarkToDest(rebasedMark, moveEffects, baseRevision, moveId, baseMark.count);
				return { count: 0 };
			}

			const nodeChange = getNodeChange(rebasedMark);
			if (nodeChange !== undefined) {
				rebasedMark = withNodeChange(rebasedMark, undefined);
				const modify: Modify<TNodeChange> = { type: "Modify", changes: nodeChange };
				sendMarkToDest(modify, moveEffects, baseRevision, moveId, baseMark.count);
			}
		}

		assert(
			!isNewAttach(rebasedMark),
			0x69d /* A new attach should not be rebased over its cell being emptied */,
		);

		if (isMoveMark(rebasedMark)) {
			if (rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Destination,
					rebasedMark.revision,
					rebasedMark.id,
					rebasedMark.count,
					PairedMarkUpdate.Deactivated,
				);
			} else if (rebasedMark.type === "ReturnTo") {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Source,
					rebasedMark.revision,
					rebasedMark.id,
					rebasedMark.count,
					PairedMarkUpdate.Reactivated,
				);
			}
		}
		assert(isDetachMark(baseMark), "Only detach marks should empty cells");
		rebasedMark = makeDetachedMark(rebasedMark, baseMarkIntention, baseMark.id);
	} else if (markFillsCells(baseMark)) {
		assert(
			isExistingCellMark(rebasedMark),
			0x69e /* Only an ExistingCellMark can target an empty cell */,
		);
		if (isMoveMark(rebasedMark)) {
			if (
				(rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") &&
				nodeExistenceState === NodeExistenceState.Alive
			) {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Destination,
					rebasedMark.revision,
					rebasedMark.id,
					rebasedMark.count,
					PairedMarkUpdate.Reactivated,
				);
			} else if (rebasedMark.type === "ReturnTo") {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Source,
					rebasedMark.revision,
					rebasedMark.id,
					rebasedMark.count,
					PairedMarkUpdate.Deactivated,
				);
			}
		}
		rebasedMark = withoutDetachEvent(rebasedMark);
	} else if (
		nodeExistenceState === NodeExistenceState.Alive &&
		(rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") &&
		rebasedMark.detachEvent === undefined
	) {
		setPairedMarkStatus(
			moveEffects,
			CrossFieldTarget.Destination,
			rebasedMark.revision,
			rebasedMark.id,
			rebasedMark.count,
			PairedMarkUpdate.Reactivated,
		);
	} else if (
		nodeExistenceState === NodeExistenceState.Dead &&
		(rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom")
	) {
		setPairedMarkStatus(
			moveEffects,
			CrossFieldTarget.Destination,
			rebasedMark.revision,
			rebasedMark.id,
			rebasedMark.count,
			PairedMarkUpdate.Deactivated,
		);
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
		case "Placeholder":
			return false;
		default:
			unreachableCase(type);
	}
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function sendMarkToDest<T>(
	mark: Mark<T>,
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag,
	id: MoveId,
	count: number,
) {
	const effect = getMoveEffect(
		moveEffects,
		CrossFieldTarget.Destination,
		revision,
		id,
		count,
		false,
	);
	let newEffect: MoveEffect<T>;
	if (effect !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			0x6f1 /* Expected effect to cover entire mark */,
		);
		newEffect = { ...effect.value, movedMark: mark };
	} else {
		newEffect = { movedMark: mark };
	}
	setMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count, newEffect);
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function setPairedMarkStatus(
	moveEffects: MoveEffectTable<unknown>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	status: PairedMarkUpdate,
) {
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	let newEffect: MoveEffect<unknown>;
	if (effect !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			0x6f2 /* Expected effect to cover entire mark */,
		);
		newEffect = { ...effect.value, pairedMarkStatus: status };
	} else {
		newEffect = { pairedMarkStatus: status };
	}
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
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
			nodeRebaser(currChange, baseChange, NodeExistenceState.Dead),
		);
	} else if (markFillsCells(baseMark) && !isMoveMark(baseMark)) {
		return withNodeChange(
			currMark,
			nodeRebaser(currChange, baseChange, NodeExistenceState.Alive),
		);
	}

	return withNodeChange(currMark, nodeRebaser(currChange, baseChange));
}

function makeDetachedMark<T>(
	mark: NoopMark | ExistingCellMark<T>,
	detachIntention: RevisionTag,
	detachId: ChangesetLocalId,
): Mark<T> {
	if (isNoopMark(mark)) {
		return { count: 0 };
	}

	assert(mark.detachEvent === undefined, 0x69f /* Expected mark to be attached */);
	return { ...mark, detachEvent: { revision: detachIntention, localId: detachId } };
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
	const factory = new MarkListFactory<TNodeChange>();

	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();

		if (baseMark === undefined) {
			assert(
				newMark !== undefined,
				"Non-empty RebaseQueue should not provide two empty marks",
			);
			factory.push(withNodeChange(newMark, rebaseChild(getNodeChange(newMark), undefined)));
		}

		if (
			baseMark !== undefined &&
			(baseMark.type === "MoveIn" || baseMark.type === "ReturnTo")
		) {
			const movedMark = getMovedMark(
				moveEffects,
				baseMark.revision ?? baseRevision,
				baseMark.id,
				baseMark.count,
			);
			if (movedMark !== undefined) {
				factory.push(movedMark);
				factory.pushOffset(-getInputLength(movedMark));
			}
		}

		if (newMark !== undefined && baseMark !== undefined) {
			const rebasedMark = rebaseNodeChange(cloneMark(newMark), baseMark, rebaseChild);
			factory.push(rebasedMark);
		}
	}

	// We may have discovered new mergeable marks while applying move effects, as we may have moved a MoveOut next to another MoveOut.
	// A second pass through MarkListFactory will handle any remaining merges.
	const factory2 = new MarkListFactory<TNodeChange>();
	for (const mark of factory.list) {
		factory2.push(mark);
	}
	return factory2.list;
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getMovedMark<T>(
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): Mark<T> | undefined {
	const effect = getMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count);

	if (effect?.value.movedMark !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			0x6f3 /* Expected effect to cover entire mark */,
		);
		const newEffect = { ...effect.value };
		delete newEffect.movedMark;
		setMoveEffect(
			moveEffects,
			CrossFieldTarget.Destination,
			revision,
			id,
			count,
			newEffect,
			false,
		);
		return effect.value.movedMark;
	}

	return undefined;
}

function handleLineage<T>(
	rebasedMark: Mark<T>,
	lineageRecipients: Mark<T>[],
	lineageEntries: IdRange[],
	baseIntention: RevisionTag,
) {
	// If the changeset we are rebasing over has the same intention as an event in rebasedMark's lineage,
	// we assume that the base changeset is the inverse of the changeset in the lineage, so we remove the lineage event.
	// TODO: Handle cases where the base changeset is a composition of multiple revisions.
	// TODO: Don't remove the lineage event in cases where the event isn't actually inverted by the base changeset,
	// e.g., if the inverse of the lineage event is muted after rebasing.
	tryRemoveLineageEvents(rebasedMark, baseIntention);

	for (const entry of lineageEntries) {
		addLineageEntry(rebasedMark, baseIntention, entry.id, entry.count, entry.count);
	}

	lineageRecipients.push(rebasedMark);
}

function addLineageToRecipients(
	recipients: Mark<unknown>[],
	revision: RevisionTag,
	id: ChangesetLocalId,
	count: number,
) {
	for (const mark of recipients) {
		addLineageEntry(mark, revision, id, count, 0);
	}
}

function addLineageEntry(
	mark: Mark<unknown>,
	revision: RevisionTag,
	id: ChangesetLocalId,
	count: number,
	offset: number,
) {
	if (mark.lineage === undefined) {
		mark.lineage = [];
	}

	if (mark.lineage.length > 0) {
		const lastEntry = mark.lineage[mark.lineage.length - 1];
		if (lastEntry.revision === revision && (lastEntry.id as number) + lastEntry.count === id) {
			if (lastEntry.offset === lastEntry.count) {
				mark.lineage[mark.lineage.length - 1] = {
					...lastEntry,
					count: lastEntry.count + count,
					offset: lastEntry.offset + offset,
				};
				return;
			} else if (offset === 0) {
				mark.lineage[mark.lineage.length - 1] = {
					...lastEntry,
					count: lastEntry.count + count,
				};
				return;
			}
		}
	}

	mark.lineage.push({ revision, id, count, offset });
}

function tryRemoveLineageEvents<T>(mark: Mark<T>, revisionToRemove: RevisionTag) {
	if (mark.lineage === undefined) {
		return;
	}

	mark.lineage = mark.lineage.filter((event) => event.revision !== revisionToRemove);
	if (mark.lineage.length === 0) {
		delete mark.lineage;
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
): number {
	const baseId = getCellId(baseMark, baseIntention);
	const baseLength = getMarkLength(baseMark);
	assert(baseId !== undefined, 0x6a0 /* baseMark should have cell ID */);
	const newId = getCellId(newMark, undefined);
	const newLength = getMarkLength(newMark);
	if (newId !== undefined && baseId.revision === newId.revision) {
		if (areOverlappingIdRanges(baseId.localId, baseLength, newId.localId, newLength)) {
			return baseId.localId - newId.localId;
		}
	}

	if (newId !== undefined) {
		const offset = getOffsetInCellRange(
			baseMark.lineage,
			newId.revision,
			newId.localId,
			newLength,
		);
		if (offset !== undefined) {
			return offset > 0 ? offset : -Infinity;
		}
	}

	const newOffset = getOffsetInCellRange(
		newMark.lineage,
		baseId.revision,
		baseId.localId,
		baseLength,
	);
	if (newOffset !== undefined) {
		return newOffset > 0 ? -newOffset : Infinity;
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
