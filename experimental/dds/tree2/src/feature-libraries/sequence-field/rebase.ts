/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { StableId } from "@fluidframework/runtime-definitions";
import { IdAllocator, fail, fakeIdAllocator, getOrAddEmptyToMap } from "../../util";
import { ChangeAtomId, ChangesetLocalId, RevisionTag, TaggedChange } from "../../core";
import {
	CrossFieldManager,
	CrossFieldTarget,
	NodeExistenceState,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	isDetach,
	cloneMark,
	areInputCellsEmpty,
	markEmptiesCells,
	markFillsCells,
	getOffsetInCellRange,
	compareLineages,
	withNodeChange,
	areOverlappingIdRanges,
	cloneCellId,
	areOutputCellsEmpty,
	isNewAttach,
	getDetachCellId,
	getInputCellId,
	isTransientEffect,
	getOutputCellId,
	getEndpoint,
	isReattach,
	splitMark,
} from "./utils";
import {
	Changeset,
	Mark,
	MarkList,
	NoopMark,
	MoveId,
	NoopMarkType,
	HasLineage,
	IdRange,
	CellMark,
	CellId,
	MarkEffect,
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
	isMoveSource,
	isMoveDestination,
} from "./moveEffectTable";
import { MarkQueue } from "./markQueue";
import { EmptyInputCellMark } from "./helperTypes";

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
	return rebaseMarkList(
		change,
		base.change,
		base.revision,
		revisionMetadata,
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
	baseRevision: RevisionTag | undefined,
	metadata: RevisionMetadataSource,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
	nodeExistenceState: NodeExistenceState,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();
	const queue = new RebaseQueue(
		baseRevision,
		baseMarkList,
		currMarkList,
		metadata,
		genId,
		moveEffects,
	);

	// Each mark with empty input cells in `currMarkList` should have a lineage event added for all adjacent detaches in the base changeset.
	// At the time we process an attach we don't know about detaches of later nodes,
	// so we record marks which should have their lineage updated if we encounter a detach.
	const lineageRecipients: Mark<TNodeChange>[] = [];

	// For each revision, stores a list of IDs of detaches encountered in the base changeset which are adjacent to the current position.
	const detachBlocks = new Map<RevisionTag, IdRange[]>();
	while (!queue.isEmpty()) {
		const { baseMark, newMark: currMark } = queue.pop();
		const rebasedMark = rebaseMark(
			currMark,
			baseMark,
			baseRevision,
			metadata,
			rebaseChild,
			moveEffects,
			nodeExistenceState,
		);

		// Note that we first add lineage for `baseMark` to `lineageRecipients`, then handle adding lineage to `rebasedMark`,
		// then add `baseMark` to `lineageEntries` so that `rebasedMark` does not get an entry for `baseMark`.
		// `rebasedMark` should already have a detach event for `baseMark`.
		if (markEmptiesCells(baseMark) || isTransientEffect(baseMark)) {
			const detachId = getOutputCellId(baseMark, baseRevision, metadata);
			assert(detachId !== undefined, "Mark which empties cells should have a detach ID");
			assert(detachId.revision !== undefined, 0x74a /* Detach ID should have a revision */);
			addLineageToRecipients(
				lineageRecipients,
				detachId.revision,
				detachId.localId,
				baseMark.count,
				metadata,
			);

			assert(
				areInputCellsEmpty(rebasedMark) && rebasedMark.cellId.revision !== undefined,
				"Mark should have empty input cells after rebasing over a cell-emptying mark",
			);

			addIdRange(getOrAddEmptyToMap(detachBlocks, detachId.revision), {
				id: detachId.localId,
				count: baseMark.count,
			});

			if (!isInverseAttach(baseMark)) {
				setMarkAdjacentCells(
					rebasedMark,
					detachBlocks.get(rebasedMark.cellId.revision) ?? [],
				);
			}
		}

		if (areInputCellsEmpty(rebasedMark)) {
			handleLineage(rebasedMark, lineageRecipients, detachBlocks, metadata);
		}
		factory.push(rebasedMark);

		if (!areOutputCellsEmpty(baseMark)) {
			lineageRecipients.length = 0;

			// TODO: Only clear detach blocks for revisions where this cell is known to be full
			detachBlocks.clear();
		}
	}

	// TODO: Should not merge marks until the end of the rebase pass,
	// since `lineageRecipients` stores direct references to rebased marks.
	return factory.list;
}

function isInverseAttach(effect: MarkEffect): boolean {
	switch (effect.type) {
		case "Delete":
		case "ReturnFrom":
			return effect.detachIdOverride !== undefined;
		case "Transient":
			return isInverseAttach(effect.detach);
		default:
			return false;
	}
}

/**
 * Generates a NoOp mark that targets the same cells as the input mark.
 * @param mark - The mark the NoOp should target.
 * @param revision - The revision, if available.
 * @returns A NoOp mark that targets the same cells as the input mark.
 */
function generateNoOpWithCellId<T>(
	mark: Mark<T>,
	revision: StableId | undefined,
	metadata: RevisionMetadataSource,
): CellMark<NoopMark, T> {
	const length = mark.count;
	const cellId = getInputCellId(mark, revision, metadata);
	return cellId === undefined ? { count: length } : { count: length, cellId };
}

class RebaseQueue<T> {
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		newMarks: Changeset<T>,
		private readonly metadata: RevisionMetadataSource,
		genId: IdAllocator,
		private readonly moveEffects: MoveEffectTable<T>,
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
		assert(
			!(baseMark === undefined && newMark === undefined),
			0x722 /* Cannot pop from empty queue */,
		);

		if (baseMark === undefined) {
			const dequeuedNewMark = this.newMarks.dequeue();
			return {
				baseMark: generateNoOpWithCellId(dequeuedNewMark, undefined, this.metadata),
				newMark: dequeuedNewMark,
			};
		} else if (newMark === undefined) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const cmp = compareCellPositions(
				this.baseMarks.revision,
				baseMark,
				newMark,
				this.metadata,
			);
			if (cmp < 0) {
				return this.dequeueBase(-cmp);
			} else if (cmp > 0) {
				const dequeuedNewMark = this.newMarks.dequeueUpTo(cmp);
				return {
					newMark: dequeuedNewMark,
					baseMark: generateNoOpWithCellId(dequeuedNewMark, undefined, this.metadata),
				};
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

	private dequeueBase(length?: number): RebaseMarks<T> {
		const baseMark =
			length !== undefined ? this.baseMarks.dequeueUpTo(length) : this.baseMarks.dequeue();

		const movedMark = getMovedMarkFromBaseMark(
			this.moveEffects,
			baseMark,
			this.baseMarks.revision,
		);
		const newMark =
			movedMark !== undefined
				? withCellId(
						movedMark,
						getInputCellId(baseMark, this.baseMarks.revision, undefined),
				  )
				: generateNoOpWithCellId(baseMark, this.baseMarks.revision, this.metadata);

		return {
			baseMark,
			newMark,
		};
	}

	private dequeueNew(): RebaseMarks<T> {
		const newMark = this.newMarks.dequeue();
		return { newMark, baseMark: generateNoOpWithCellId(newMark, undefined, this.metadata) };
	}

	private dequeueBoth(): RebaseMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x69c /* Cannot dequeue both unless both mark queues are non-empty */,
		);
		const length = Math.min(newMark.count, baseMark.count);
		assert(
			getMovedMarkFromBaseMark(this.moveEffects, baseMark, this.baseMarks.revision) ===
				undefined,
			"A new mark should not be moved to the location of an existing new mark",
		);
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
	baseMark: Mark<T>;
	newMark: Mark<T>;
}

function rebaseMark<TNodeChange>(
	currMark: Mark<TNodeChange>,
	baseMark: Mark<TNodeChange>,
	baseRevision: RevisionTag | undefined,
	metadata: RevisionMetadataSource,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
	nodeExistenceState: NodeExistenceState,
): Mark<TNodeChange> {
	const rebasedMark = rebaseNodeChange(cloneMark(currMark), baseMark, rebaseChild);
	return rebaseMarkIgnoreChild(
		rebasedMark,
		baseMark,
		baseRevision,
		metadata,
		moveEffects,
		nodeExistenceState,
	);
}

function rebaseMarkIgnoreChild<TNodeChange>(
	currMark: Mark<TNodeChange>,
	baseMark: Mark<TNodeChange>,
	baseRevision: RevisionTag | undefined,
	metadata: RevisionMetadataSource,
	moveEffects: MoveEffectTable<TNodeChange>,
	nodeExistenceState: NodeExistenceState,
): Mark<TNodeChange> {
	let rebasedMark = currMark;
	if (markEmptiesCells(baseMark)) {
		assert(isDetach(baseMark), 0x70b /* Only detach marks should empty cells */);
		const baseCellId = getDetachCellId(baseMark, baseRevision, metadata);

		// TODO: Should also check if this is a transient move source
		if (isMoveSource(baseMark)) {
			assert(isMoveMark(baseMark), 0x6f0 /* Only move marks have move IDs */);
			if (markFollowsMoves(rebasedMark)) {
				sendMarkToDest(
					rebasedMark,
					moveEffects,
					getEndpoint(baseMark, baseRevision),
					baseMark.count,
				);
				return { count: baseMark.count, cellId: cloneCellId(baseCellId) };
			}

			const modify = rebasedMark.changes;
			if (modify !== undefined) {
				rebasedMark = withNodeChange(rebasedMark, undefined);
				const nestedChange: CellMark<NoopMark, TNodeChange> = {
					count: 1,
					changes: modify,
				};
				sendMarkToDest(
					nestedChange,
					moveEffects,
					getEndpoint(baseMark, baseRevision),
					baseMark.count,
				);
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
					getEndpoint(rebasedMark, undefined),
					rebasedMark.count,
					PairedMarkUpdate.Deactivated,
				);
			} else if (isReattach(rebasedMark)) {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Source,
					getEndpoint(rebasedMark, undefined),
					rebasedMark.count,
					PairedMarkUpdate.Reactivated,
				);
			}
		}

		rebasedMark = makeDetachedMark(rebasedMark, cloneCellId(baseCellId));
	} else if (markFillsCells(baseMark)) {
		if (isMoveMark(rebasedMark)) {
			if (
				(rebasedMark.type === "MoveOut" || rebasedMark.type === "ReturnFrom") &&
				nodeExistenceState === NodeExistenceState.Alive
			) {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Destination,
					getEndpoint(rebasedMark, undefined),
					rebasedMark.count,
					PairedMarkUpdate.Reactivated,
				);
			} else if (isReattach(rebasedMark)) {
				setPairedMarkStatus(
					moveEffects,
					CrossFieldTarget.Source,
					getEndpoint(rebasedMark, undefined),
					rebasedMark.count,
					PairedMarkUpdate.Deactivated,
				);
			}
		}
		rebasedMark = withCellId(rebasedMark, undefined);
	} else if (isTransientEffect(baseMark)) {
		assert(baseMark.cellId !== undefined, "Transient mark should target an empty cell");
		rebasedMark = rebaseMarkIgnoreChild(
			rebasedMark,
			{ ...baseMark.attach, cellId: cloneCellId(baseMark.cellId), count: baseMark.count },
			baseRevision,
			metadata,
			moveEffects,
			nodeExistenceState,
		);
		rebasedMark = rebaseMarkIgnoreChild(
			rebasedMark,
			{ ...baseMark.detach, count: baseMark.count },
			baseRevision,
			metadata,
			moveEffects,
			nodeExistenceState,
		);
	}
	return rebasedMark;
}

function markFollowsMoves(mark: Mark<unknown>): boolean {
	assert(!isNewAttach(mark), "New attaches should not be rebased over moves");
	const type = mark.type;
	switch (type) {
		case "Insert":
		case "Delete":
		case "MoveOut":
		case "Transient":
			// TODO: Handle cases where transient attach and detach have different move-following policies.
			return true;
		case NoopMarkType:
		case "ReturnFrom":
		case "MoveIn":
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
	{ revision, localId: id }: ChangeAtomId,
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
	assert(effect.length === count, 0x6f1 /* Expected effect to cover entire mark */);
	const newEffect =
		effect.value !== undefined ? { ...effect.value, movedMark: mark } : { movedMark: mark };
	setMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count, newEffect);
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function setPairedMarkStatus(
	moveEffects: MoveEffectTable<unknown>,
	target: CrossFieldTarget,
	{ revision, localId: id }: ChangeAtomId,
	count: number,
	status: PairedMarkUpdate,
) {
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	assert(effect.length === count, 0x6f2 /* Expected effect to cover entire mark */);
	const newEffect =
		effect.value !== undefined
			? { ...effect.value, pairedMarkStatus: status }
			: { pairedMarkStatus: status };
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

function rebaseNodeChange<TNodeChange>(
	currMark: Mark<TNodeChange>,
	baseMark: Mark<TNodeChange>,
	nodeRebaser: NodeChangeRebaser<TNodeChange>,
): Mark<TNodeChange> {
	const baseChange = baseMark.changes;
	const currChange = currMark.changes;

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

function makeDetachedMark<T>(mark: Mark<T>, cellId: ChangeAtomId): Mark<T> {
	assert(mark.cellId === undefined, 0x69f /* Expected mark to be attached */);
	return { ...mark, cellId };
}

function withCellId<TMark extends Mark<unknown>>(mark: TMark, cellId: CellId | undefined): TMark {
	const newMark = { ...mark, cellId };
	if (cellId === undefined) {
		delete newMark.cellId;
	}
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
		// Should not generate new IDs when applying move effects
		fakeIdAllocator,
		moveEffects,
		revisionMetadata,
	);
	const factory = new MarkListFactory<TNodeChange>();

	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();

		if (baseMark === undefined) {
			assert(
				newMark !== undefined,
				0x70c /* Non-empty RebaseQueue should not provide two empty marks */,
			);
			factory.push(withNodeChange(newMark, rebaseChild(newMark.changes, undefined)));
			continue;
		}

		const movedMark = getMovedMarkFromBaseMark(moveEffects, baseMark, baseRevision);
		if (movedMark !== undefined) {
			assert(
				newMark === undefined ||
					(newMark.type === NoopMarkType && newMark.changes === undefined),
				"A new mark should not be moved to the location of an existing new mark",
			);
			factory.push(rebaseNodeChange(cloneMark(movedMark), baseMark, rebaseChild));
			continue;
		}

		if (newMark !== undefined) {
			const rebasedMark = rebaseNodeChange(cloneMark(newMark), baseMark, rebaseChild);
			factory.push(rebasedMark);
		}
	}

	return factory.list;
}

function getMovedMarkFromBaseMark<T>(
	moveEffects: MoveEffectTable<T>,
	baseMark: Mark<T>,
	baseRevision: RevisionTag | undefined,
): Mark<T> | undefined {
	if (isMoveDestination(baseMark)) {
		return getMovedMark(
			moveEffects,
			baseMark.revision ?? baseRevision,
			baseMark.id,
			baseMark.count,
		);
	} else if (isTransientEffect(baseMark) && isMoveDestination(baseMark.attach)) {
		return getMovedMark(
			moveEffects,
			baseMark.attach.revision ?? baseRevision,
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
function getMovedMark<T>(
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): Mark<T> | undefined {
	const effect = getMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count);
	assert(effect.length === count, 0x6f3 /* Expected effect to cover entire mark */);

	if (effect.value?.movedMark !== undefined) {
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

		if (effect.value.movedMark.count === count) {
			return effect.value.movedMark;
		}
		const [mark1, _mark2] = splitMark(effect.value.movedMark, count);
		return mark1;
	}

	return undefined;
}

function handleLineage<T>(
	rebasedMark: Mark<T>,
	lineageRecipients: Mark<T>[],
	detachBlocks: Map<RevisionTag, IdRange[]>,
	metadata: RevisionMetadataSource,
) {
	const lineageHolder = getLineageHolder(rebasedMark);

	for (const revision of metadata.getIntentions()) {
		tryRemoveLineageEvents(lineageHolder, revision);
	}

	const cellRevision = getInputCellId(rebasedMark, undefined, undefined)?.revision;
	const index = cellRevision !== undefined ? metadata.getIndex(cellRevision) : undefined;

	for (const [revision, detachBlock] of detachBlocks.entries()) {
		if (index === undefined || index < getKnownRevisionIndex(revision, metadata)) {
			for (const entry of detachBlock) {
				addLineageEntry(lineageHolder, revision, entry.id, entry.count, entry.count);
			}
		}
	}

	lineageRecipients.push(rebasedMark);
}

function addLineageToRecipients(
	recipients: Mark<unknown>[],
	revision: RevisionTag,
	id: ChangesetLocalId,
	count: number,
	metadata: RevisionMetadataSource,
) {
	for (const mark of recipients) {
		if (getInputCellId(mark, undefined, metadata)?.revision !== revision) {
			addLineageEntry(getLineageHolder(mark), revision, id, count, 0);
		}
	}
}

function addLineageEntry(
	lineageHolder: HasLineage,
	revision: RevisionTag,
	id: ChangesetLocalId,
	count: number,
	offset: number,
) {
	if (lineageHolder.lineage === undefined) {
		lineageHolder.lineage = [];
	}

	if (lineageHolder.lineage.length > 0) {
		const lastEntry = lineageHolder.lineage[lineageHolder.lineage.length - 1];
		if (lastEntry.revision === revision && (lastEntry.id as number) + lastEntry.count === id) {
			if (lastEntry.offset === lastEntry.count) {
				lineageHolder.lineage[lineageHolder.lineage.length - 1] = {
					...lastEntry,
					count: lastEntry.count + count,
					offset: lastEntry.offset + offset,
				};
				return;
			} else if (offset === 0) {
				lineageHolder.lineage[lineageHolder.lineage.length - 1] = {
					...lastEntry,
					count: lastEntry.count + count,
				};
				return;
			}
		}
	}

	lineageHolder.lineage.push({ revision, id, count, offset });
}

function tryRemoveLineageEvents(lineageHolder: HasLineage, revisionToRemove: RevisionTag) {
	if (lineageHolder.lineage === undefined) {
		return;
	}

	lineageHolder.lineage = lineageHolder.lineage.filter(
		(event) => event.revision !== revisionToRemove,
	);
	if (lineageHolder.lineage.length === 0) {
		delete lineageHolder.lineage;
	}
}

function getKnownRevisionIndex(revision: RevisionTag, metadata: RevisionMetadataSource): number {
	const index = metadata.getIndex(revision);
	assert(index !== undefined, "Unknown revision");
	return index;
}

function addIdRange(lineageEntries: IdRange[], range: IdRange): void {
	if (lineageEntries.length > 0) {
		const lastEntry = lineageEntries[lineageEntries.length - 1];
		if ((lastEntry.id as number) + lastEntry.count === range.id) {
			lastEntry.count += range.count;
			return;
		}
	}

	lineageEntries.push(range);
}

function getLineageHolder(mark: Mark<unknown>): HasLineage {
	assert(mark.cellId !== undefined, 0x723 /* Attached cells cannot have lineage */);
	return mark.cellId;
}

function setMarkAdjacentCells(mark: Mark<unknown>, adjacentCells: IdRange[]): void {
	assert(
		mark.cellId !== undefined,
		0x74d /* Can only set adjacent cells on a mark with cell ID */,
	);
	assert(mark.cellId.adjacentCells === undefined, 0x74e /* Should not overwrite adjacentCells */);
	mark.cellId.adjacentCells = adjacentCells;
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
	baseRevision: RevisionTag | undefined,
	baseMark: EmptyInputCellMark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	metadata: RevisionMetadataSource,
): number {
	const baseId = getInputCellId(baseMark, baseRevision, metadata);
	const baseLength = baseMark.count;
	assert(baseId !== undefined, 0x6a0 /* baseMark should have cell ID */);
	const newId = getInputCellId(newMark, undefined, metadata);
	const newLength = newMark.count;
	if (newId !== undefined && baseId.revision === newId.revision) {
		if (areOverlappingIdRanges(baseId.localId, baseLength, newId.localId, newLength)) {
			return baseId.localId - newId.localId;
		}

		const adjacentCells = baseId.adjacentCells ?? newId.adjacentCells;
		if (adjacentCells !== undefined) {
			return (
				getPositionAmongAdjacentCells(adjacentCells, baseId.localId) -
				getPositionAmongAdjacentCells(adjacentCells, newId.localId)
			);
		}
	}

	if (newId !== undefined) {
		const offset = getOffsetInCellRange(
			baseId.lineage,
			newId.revision,
			newId.localId,
			newLength,
		);
		if (offset !== undefined) {
			return offset > 0 ? offset : -Infinity;
		}

		const newOffset = getOffsetInCellRange(
			newId.lineage,
			baseId.revision,
			baseId.localId,
			baseLength,
		);
		if (newOffset !== undefined) {
			return newOffset > 0 ? -newOffset : Infinity;
		}
	}

	if (newId !== undefined) {
		const cmp = compareLineages(baseId.lineage, newId.lineage);
		if (cmp !== 0) {
			return Math.sign(cmp) * Infinity;
		}
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

	// BUG 5351: The following assumption is incorrect as `newMark` may be targeting cells which were created on its branch,
	// which will come after `baseMark` in the final sequence order.
	// `newMark` points to cells which were emptied before `baseMark` was created.
	// We use `baseMark`'s tiebreak policy as if `newMark`'s cells were created concurrently and before `baseMark`.
	// TODO: Use specified tiebreak instead of always tiebreaking left.
	return -Infinity;
}

function getPositionAmongAdjacentCells(adjacentCells: IdRange[], id: ChangesetLocalId): number {
	let priorCells = 0;
	for (const range of adjacentCells) {
		if (areOverlappingIdRanges(range.id, range.count, id, 1)) {
			return priorCells + (id - range.id);
		}

		priorCells += range.count;
	}

	fail("Could not find id in adjacentCells");
}
