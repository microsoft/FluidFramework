/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { StableId } from "@fluidframework/runtime-definitions";
import { IdAllocator, brand, fail, getOrAddEmptyToMap } from "../../util";
import {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionMetadataSource,
	RevisionTag,
	TaggedChange,
} from "../../core";
import {
	CrossFieldManager,
	CrossFieldTarget,
	NodeExistenceState,
	RebaseRevisionMetadata,
	getIntention,
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
	cloneCellId,
	areOutputCellsEmpty,
	isNewAttach,
	getInputCellId,
	isAttachAndDetachEffect,
	getOutputCellId,
	getEndpoint,
	splitMark,
	isAttach,
	getDetachOutputId,
	isImpactfulCellRename,
	compareCellsFromSameRevision,
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
	MoveOut,
	MoveIn,
	LineageEvent,
} from "./types";
import { MarkListFactory } from "./markListFactory";
import {
	getMoveEffect,
	setMoveEffect,
	isMoveMark,
	MoveEffect,
	MoveEffectTable,
	isMoveOut,
	isMoveIn,
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
	revisionMetadata: RebaseRevisionMetadata,
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
	metadata: RebaseRevisionMetadata,
	rebaseChild: NodeChangeRebaser<TNodeChange>,
	genId: IdAllocator,
	moveEffects: CrossFieldManager<MoveEffect<TNodeChange>>,
	nodeExistenceState: NodeExistenceState,
): MarkList<TNodeChange> {
	const rebasedMarks: Mark<TNodeChange>[] = [];
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
	const rebasedCellBlocks: CellBlockList = [];

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

		if (markEmptiesCells(baseMark) || isImpactfulCellRename(baseMark, baseRevision, metadata)) {
			// Note that we want the revision in the detach ID to be the actual revision, not the intention.
			// We don't pass a `RevisionMetadataSource` to `getOutputCellId` so that we get the true revision.
			const detachId = getOutputCellId(baseMark, baseRevision, undefined);
			assert(
				detachId !== undefined,
				0x816 /* Mark which empties cells should have a detach ID */,
			);
			assert(detachId.revision !== undefined, 0x74a /* Detach ID should have a revision */);
			const detachBlock = getOrAddEmptyToMap(detachBlocks, detachId.revision);
			addIdRange(detachBlock, {
				id: detachId.localId,
				count: baseMark.count,
			});

			addLineageToRecipients(
				rebasedCellBlocks,
				detachId.revision,
				detachId.localId,
				baseMark.count,
				metadata,
			);

			assert(
				areInputCellsEmpty(rebasedMark) && rebasedMark.cellId.revision !== undefined,
				0x817 /* Mark should have empty input cells after rebasing over a cell-emptying mark */,
			);

			// A re-detach sports a cell ID with the adjacent cells from the original detach.
			// Marks that are rebased over such a re-detach will adopt this cell ID as-is and do not need to have the
			// adjacent cells be updated. Moreover, the base changeset may not have all the detaches from the original
			// detach revision, so using such re-detach marks to compile the list of adjacent cells would run the risk
			// of ending up with incomplete adjacent cell information in the rebased mark.
			if (!isRedetach(baseMark)) {
				// BUG#6604:
				// We track blocks of adjacent cells for rollbacks separately from that of the original revision
				// that they are a rollback of, but all rebased marks use the original revision in their `CellId`.
				// This means we assign adjacent cells information for the rollback to a `CellId` that advertises
				// itself as being about the original revision.
				// This could lead to a situation where we try to compare two cells and fail to order them correctly
				// because one sports adjacent cells information for the original revision and the other sports
				// adjacent cells information for the rollback.
				setMarkAdjacentCells(rebasedMark, detachBlock);
			}
		}

		if (areInputCellsEmpty(rebasedMark)) {
			handleLineage(rebasedMark.cellId, detachBlocks, metadata);
		}
		rebasedMarks.push(rebasedMark);
		updateLineageState(
			rebasedCellBlocks,
			detachBlocks,
			baseMark,
			baseRevision,
			rebasedMark,
			metadata,
		);
	}

	return mergeMarkList(rebasedMarks);
}

function mergeMarkList<T>(marks: Mark<T>[]): Mark<T>[] {
	const factory = new MarkListFactory<T>();
	for (const mark of marks) {
		factory.push(mark);
	}

	return factory.list;
}

function isRedetach(effect: MarkEffect): boolean {
	switch (effect.type) {
		case "Delete":
		case "MoveOut":
			return effect.redetachId !== undefined;
		case "AttachAndDetach":
			return isRedetach(effect.detach);
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
		this.newMarks = new MarkQueue(newMarks, undefined, moveEffects, false, genId);
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
		const sizedBaseMark = this.baseMarks.dequeueUpTo(length);
		const sizedNewMark = this.newMarks.dequeueUpTo(length);
		const movedMark = getMovedMarkFromBaseMark(
			this.moveEffects,
			sizedBaseMark,
			this.baseMarks.revision,
		);
		return {
			baseMark: sizedBaseMark,
			newMark: movedMark === undefined ? sizedNewMark : fuseMarks(sizedNewMark, movedMark),
		};
	}
}

function fuseMarks<T>(newMark: Mark<T>, movedMark: Mark<T>): Mark<T> {
	if (isMoveIn(newMark) && isMoveOut(movedMark)) {
		const fusedMark: Mark<T> = {
			type: "Insert",
			count: newMark.count,
			id: newMark.id,
		};
		if (movedMark.cellId !== undefined) {
			fusedMark.cellId = cloneCellId(movedMark.cellId);
		}
		if (movedMark.revision !== undefined) {
			fusedMark.revision = movedMark.revision;
		}
		if (movedMark.changes !== undefined) {
			fusedMark.changes = movedMark.changes;
		}
		return fusedMark;
	}
	// The only case we expect for two marks from the same changeset to overlap is when one is a move source
	// and the other is a move destination bringing the nodes back into place.
	assert(false, 0x818 /* Unexpected combination of moved and new marks */);
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
	let rebasedMark: Mark<TNodeChange>;
	if (isDetach(baseMark)) {
		if (baseMark.cellId !== undefined) {
			// Detaches on empty cells have an implicit revive effect.
			delete currMark.cellId;
		}
		assert(
			!isNewAttach(currMark),
			0x69d /* A new attach should not be rebased over its cell being emptied */,
		);
		const baseCellId = getDetachOutputId(baseMark, baseRevision, metadata);

		if (isMoveOut(baseMark)) {
			assert(isMoveMark(baseMark), 0x6f0 /* Only move marks have move IDs */);
			assert(
				!isNewAttach(currMark),
				0x819 /* New attaches should not be rebased over moves */,
			);
			const { remains, follows } = separateEffectsForMove(currMark);
			if (follows !== undefined || currMark.changes !== undefined) {
				sendMarkToDest(
					withNodeChange({ ...follows, count: baseMark.count }, currMark.changes),
					moveEffects,
					getEndpoint(baseMark, baseRevision),
					baseMark.count,
				);
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
			baseRevision,
			metadata,
			moveEffects,
			nodeExistenceState,
		);
		rebasedMark = rebaseMarkIgnoreChild(
			halfRebasedMark,
			{ ...baseMark.detach, count: baseMark.count },
			baseRevision,
			metadata,
			moveEffects,
			nodeExistenceState,
		);
	} else {
		rebasedMark = currMark;
	}
	return rebasedMark;
}

/**
 * @returns A pair of marks that represent the effects which should remain in place in the face of concurrent move,
 * and the effects that should be sent to the move destination.
 */
function separateEffectsForMove(mark: MarkEffect): { remains?: MarkEffect; follows?: MarkEffect } {
	const type = mark.type;
	switch (type) {
		case "Delete":
		case "MoveOut":
			return { follows: mark };
		case "AttachAndDetach":
			return { follows: mark.detach, remains: mark.attach };
		case "MoveIn":
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
	if (effect.length < count) {
		const [mark1, mark2] = splitMark(mark, effect.length);
		const newEffect =
			effect.value !== undefined
				? { ...effect.value, movedMark: mark1 }
				: { movedMark: mark1 };
		setMoveEffect(
			moveEffects,
			CrossFieldTarget.Destination,
			revision,
			id,
			effect.length,
			newEffect,
		);
		sendMarkToDest(
			mark2,
			moveEffects,
			{ revision, localId: brand(id + effect.length) },
			count - effect.length,
		);
	} else {
		const newEffect =
			effect.value !== undefined ? { ...effect.value, movedMark: mark } : { movedMark: mark };
		setMoveEffect(moveEffects, CrossFieldTarget.Destination, revision, id, count, newEffect);
	}
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

function getMovedMarkFromBaseMark<T>(
	moveEffects: MoveEffectTable<T>,
	baseMark: Mark<T>,
	baseRevision: RevisionTag | undefined,
): Mark<T> | undefined {
	if (isMoveIn(baseMark)) {
		return getMovedMark(
			moveEffects,
			baseMark.revision ?? baseRevision,
			baseMark.id,
			baseMark.count,
		);
	} else if (isAttachAndDetachEffect(baseMark) && isMoveIn(baseMark.attach)) {
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

type CellBlockList = CellBlock[];

interface CellBlock {
	readonly cellId: CellId | undefined;

	// The index of the oldest revision where this cell is full in its output context.
	// May be -Infinity if the cell was full in the input context of the base changeset,
	// or +Infinity if the cell was empty for all revisions in the base changeset.
	readonly firstAttachedRevisionIndex: number;

	// The index of the newest revision where this cell is full in its output context.
	// May be -Infinity if the cell was empty for all revisions in the base changeset,
	// or +Infinity if the cell is full in the output context of the base changeset.
	readonly lastAttachedRevisionIndex: number;
}

function handleLineage(
	cellId: CellId,
	detachBlocks: Map<RevisionTag, IdRange[]>,
	metadata: RebaseRevisionMetadata,
) {
	const baseRevisions = metadata
		.getBaseRevisions()
		.map((r) => getIntention(r, metadata) ?? fail("Intention should be defined"));

	removeLineageEvents(cellId, new Set(baseRevisions));

	for (const [revision, detachBlock] of detachBlocks.entries()) {
		if (shouldReceiveLineage(cellId.revision, revision, metadata)) {
			const intention = metadata.tryGetInfo(revision)?.rollbackOf ?? revision;
			for (const entry of detachBlock) {
				addLineageEntry(cellId, intention, entry.id, entry.count, entry.count);
			}
		}
	}
}

function getRevisionIndex(metadata: RevisionMetadataSource, revision: RevisionTag): number {
	const index = metadata.getIndex(revision);
	if (index !== undefined) {
		return index;
	}

	// This revision is not in the changesets being handled and must be older than them.
	return -Infinity;
}

function updateLineageState(
	cellBlocks: CellBlockList,
	detachBlocks: Map<RevisionTag, IdRange[]>,
	baseMark: Mark<unknown>,
	baseRevision: RevisionTag | undefined,
	rebasedMark: Mark<unknown>,
	metadata: RevisionMetadataSource,
) {
	const attachRevisionIndex = getAttachRevisionIndex(metadata, baseMark, baseRevision);
	const detachRevisionIndex = getDetachRevisionIndex(metadata, baseMark, baseRevision);
	for (const revision of detachBlocks.keys()) {
		const revisionIndex = getRevisionIndex(metadata, revision);
		// revisionIndex can be -Infinity if it is from a re-detach
		if (
			revisionIndex > -Infinity &&
			attachRevisionIndex <= revisionIndex &&
			revisionIndex < detachRevisionIndex
		) {
			detachBlocks.delete(revision);
		}
	}

	cellBlocks.push({
		cellId: rebasedMark.cellId,
		firstAttachedRevisionIndex: attachRevisionIndex,
		lastAttachedRevisionIndex: detachRevisionIndex - 1,
	});
}

function getAttachRevisionIndex(
	metadata: RevisionMetadataSource,
	baseMark: Mark<unknown>,
	baseRevision: RevisionTag | undefined,
): number {
	if (!areInputCellsEmpty(baseMark)) {
		return -Infinity;
	}

	if (markFillsCells(baseMark)) {
		assert(isAttach(baseMark), 0x81b /* Only attach marks can fill cells */);
		return getRevisionIndex(
			metadata,
			baseMark.revision ?? baseRevision ?? fail("Mark must have revision"),
		);
	}

	if (isAttachAndDetachEffect(baseMark)) {
		return getRevisionIndex(
			metadata,
			baseMark.attach.revision ?? baseRevision ?? fail("Mark must have revision"),
		);
	}

	return Infinity;
}

function getDetachRevisionIndex(
	metadata: RevisionMetadataSource,
	baseMark: Mark<unknown>,
	baseRevision: RevisionTag | undefined,
): number {
	if (!areOutputCellsEmpty(baseMark)) {
		return Infinity;
	}

	if (markEmptiesCells(baseMark)) {
		assert(isDetach(baseMark), 0x81c /* Only detach marks can empty cells */);
		return getRevisionIndex(
			metadata,
			baseMark.revision ?? baseRevision ?? fail("Mark must have revision"),
		);
	}

	if (isAttachAndDetachEffect(baseMark)) {
		return getRevisionIndex(
			metadata,
			baseMark.detach.revision ?? baseRevision ?? fail("Mark must have revision"),
		);
	}

	return -Infinity;
}

function addLineageToRecipients(
	cellBlocks: CellBlockList,
	revision: RevisionTag,
	id: ChangesetLocalId,
	count: number,
	metadata: RebaseRevisionMetadata,
) {
	const rollbackOf = metadata.tryGetInfo(revision)?.rollbackOf;
	const intention = rollbackOf ?? revision;
	const intentionIndex = getRevisionIndex(metadata, intention);
	for (let i = cellBlocks.length - 1; i >= 0; i--) {
		const entry = cellBlocks[i];
		if (
			entry.firstAttachedRevisionIndex <= intentionIndex &&
			intentionIndex <= entry.lastAttachedRevisionIndex
		) {
			// These cells were full in this revision, so cells earlier in the sequence
			// do not need to know about this lineage event.
			return;
		}

		// We only add lineage to cells which were detached before the lineage event occurred.
		if (entry.cellId === undefined) {
			continue;
		}

		if (shouldReceiveLineage(entry.cellId.revision, revision, metadata)) {
			addLineageEntry(entry.cellId, intention, id, count, 0);
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

function removeLineageEvents(lineageHolder: HasLineage, revisionsToRemove: Set<RevisionTag>) {
	if (lineageHolder.lineage === undefined) {
		return;
	}

	lineageHolder.lineage = lineageHolder.lineage.filter(
		(event) => !revisionsToRemove.has(event.revision),
	);
	if (lineageHolder.lineage.length === 0) {
		delete lineageHolder.lineage;
	}
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

function setMarkAdjacentCells(mark: Mark<unknown>, adjacentCells: IdRange[]): void {
	assert(
		mark.cellId !== undefined,
		0x74d /* Can only set adjacent cells on a mark with cell ID */,
	);
	assert(mark.cellId.adjacentCells === undefined, 0x74e /* Should not overwrite adjacentCells */);
	mark.cellId.adjacentCells = adjacentCells;
}

function shouldReceiveLineage(
	cellRevision: RevisionTag | undefined,
	detachRevision: RevisionTag,
	metadata: RevisionMetadataSource,
): boolean {
	if (cellRevision === undefined) {
		// An undefined cell revision means that the cell was created by the changeset we are rebasing.
		// Since this cell was been empty for all base revisions, it should receive lineage from all of them.
		// TODO: This cell does not need lineage from roll-forward revisions.
		return true;
	}

	const cellRevisionIndex = getRevisionIndex(metadata, cellRevision);
	const rollbackOf = metadata.tryGetInfo(detachRevision)?.rollbackOf;
	const detachIntention = rollbackOf ?? detachRevision;
	const detachRevisionIndex = getRevisionIndex(metadata, detachIntention);
	if (detachRevisionIndex === undefined) {
		// This case means that these cells are being "re-detached" through a `redetachId`.
		// We could use the revision of the re-detach to determine whether or not this cell needs this lineage entry.
		// But to be conservative we always add lineage here.
		return true;
	}

	const isRollback = rollbackOf !== undefined;
	return isRollback
		? detachRevisionIndex < cellRevisionIndex
		: detachRevisionIndex > cellRevisionIndex;
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
	assert(baseId?.revision !== undefined, 0x6a0 /* baseMark should have cell ID */);
	const newId = getInputCellId(newMark, undefined, metadata);
	assert(newId !== undefined, 0x85a /* newMark should have cell ID */);
	const newLength = newMark.count;
	if (newId !== undefined && baseId.revision === newId.revision) {
		const cmp = compareCellsFromSameRevision(baseId, baseMark.count, newId, newMark.count);
		if (cmp !== undefined) {
			return cmp;
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
		const cmp = compareLineages(baseId, newId);
		if (cmp !== 0) {
			return Math.sign(cmp) * Infinity;
		}

		const cmp2 = compareMissingLineageEntries(baseId.lineage, newId.lineage, metadata);
		if (cmp2 !== 0) {
			return Math.sign(cmp2) * Infinity;
		}
	}

	// Both cells must never have been filled (in their common history), otherwise they would have some common lineage.
	// A new attach targets a cell that has never been filled.
	// A mark can also target a cell which was initially filled on another branch, but which has never been filled on the current branch.
	if (newId.revision === undefined) {
		// An undefined revision must mean that the cell was created on the branch we are rebasing.
		// Since it is newer than the `baseMark`'s cell, it should come first.
		return Infinity;
	}

	const baseRevisionIndex = metadata.getIndex(baseId.revision);
	const newRevisionIndex = metadata.getIndex(newId.revision);

	if (newRevisionIndex !== undefined && baseRevisionIndex !== undefined) {
		return newRevisionIndex > baseRevisionIndex ? Infinity : -Infinity;
	}

	if (newRevisionIndex !== undefined) {
		return Infinity;
	}

	if (baseRevisionIndex !== undefined) {
		return -Infinity;
	}

	// `newMark` points to cells which were emptied before `baseMark` was created.
	// We use `baseMark`'s tiebreak policy as if `newMark`'s cells were created concurrently and before `baseMark`.
	return -Infinity;
}

function compareMissingLineageEntries(
	lineage1: LineageEvent[] | undefined,
	lineage2: LineageEvent[] | undefined,
	metadata: RevisionMetadataSource,
): number {
	const events1 = new Map<RevisionTag, LineageEvent>();
	for (const event of lineage1 ?? []) {
		events1.set(event.revision, event);
	}

	const events2 = new Map<RevisionTag, LineageEvent>();
	for (const event of lineage2 ?? []) {
		events2.set(event.revision, event);
	}

	for (const revision of events1.keys()) {
		if (events2.has(revision)) {
			events1.delete(revision);
			events2.delete(revision);
		}
	}

	for (const event of events2.values()) {
		// We've found a cell C that was emptied before the cell1 started tracking lineage.
		// The cell1 should come before any such cell, so if cell2 comes after C
		// then we know that cell1 should come before the cell2.
		// TODO: Account for the cell1's tiebreak policy
		if (!metadata.hasRollback(event.revision) && event.offset !== 0) {
			return -1;
		}
	}

	// cell1Events now contains only revisions which were not in cell2's lineage.
	for (const event of events1.values()) {
		// We've found a cell C that was emptied before the cell2 started tracking lineage.
		// The cell2 should come before any such cell, so if cell1 comes after C
		// then we know that cell2 should come before the cell1.
		// TODO: Account for the cell2's tiebreak policy
		if (!metadata.hasRollback(event.revision) && event.offset !== 0) {
			return 1;
		}
	}

	return 0;
}
