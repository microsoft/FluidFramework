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
	areOverlappingIdRanges,
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
	isCellRename,
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
	ReturnFrom,
	MoveIn,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { ComposeQueue } from "./compose";
import {
	getMoveEffect,
	setMoveEffect,
	isMoveMark,
	MoveEffect,
	MoveEffectTable,
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

		// Inverse attaches do not contribute to lineage as they are effectively reinstating
		// an older detach which cells should already have any necessary lineage for.
		if ((markEmptiesCells(baseMark) || isCellRename(baseMark)) && !isInverseAttach(baseMark)) {
			const detachId = getOutputCellId(baseMark, baseRevision, metadata);
			assert(
				detachId !== undefined,
				0x816 /* Mark which empties cells should have a detach ID */,
			);
			assert(detachId.revision !== undefined, 0x74a /* Detach ID should have a revision */);
			addIdRange(getOrAddEmptyToMap(detachBlocks, detachId.revision), {
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

			setMarkAdjacentCells(rebasedMark, detachBlocks.get(rebasedMark.cellId.revision) ?? []);
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

function isInverseAttach(effect: MarkEffect): boolean {
	switch (effect.type) {
		case "Delete":
		case "ReturnFrom":
			return effect.detachIdOverride !== undefined;
		case "AttachAndDetach":
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
	if (isMoveDestination(newMark) && movedMark.type === "ReturnFrom") {
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

		if (isMoveSource(baseMark)) {
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
		case "ReturnFrom":
			return { follows: mark };
		case "AttachAndDetach":
			return { follows: mark.detach, remains: mark.attach };
		case "MoveIn":
			return { remains: mark };
		case NoopMarkType:
			return {};
		case "Insert": {
			const follows: ReturnFrom = {
				type: "ReturnFrom",
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
		case "Placeholder":
			fail("Placeholder marks should not be rebased");
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
		let fusedMark: Mark<TNodeChange>;
		if (movedMark !== undefined) {
			fusedMark =
				newMark === undefined ||
				(newMark.type === NoopMarkType && newMark.changes === undefined)
					? cloneMark(movedMark)
					: fuseMarks(newMark, movedMark);
			factory.push(rebaseNodeChange(fusedMark, baseMark, rebaseChild));
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
	} else if (isAttachAndDetachEffect(baseMark) && isMoveDestination(baseMark.attach)) {
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
	metadata: RevisionMetadataSource,
) {
	tryRemoveLineageEvents(
		cellId,
		new Set(
			metadata
				.getRevisions()
				.map((r) => getIntention(r, metadata) ?? fail("Intention should be defined")),
		),
	);

	// An undefined cell revision means this cell has never been filled or emptied.
	// It is being created by the anonymous rebasing revision.
	// This cell should get lineage from all revisions, so we treat it as older than all of them.
	const revisionIndex =
		cellId.revision === undefined ? -Infinity : getRevisionIndex(metadata, cellId.revision);

	for (const [revision, detachBlock] of detachBlocks.entries()) {
		if (revisionIndex < getRevisionIndex(metadata, revision)) {
			for (const entry of detachBlock) {
				addLineageEntry(cellId, revision, entry.id, entry.count, entry.count);
			}
		}
	}
}

function getRevisionIndex(metadata: RevisionMetadataSource, revision: RevisionTag): number {
	const index = metadata.getIndex(revision);
	if (index !== undefined) {
		return index;
	}

	const revisions = metadata.getRevisions();
	const rollbackIndex = revisions.findIndex(
		(r) => metadata.tryGetInfo(r)?.rollbackOf === revision,
	);

	if (rollbackIndex >= 0) {
		// `revision` is not in the metadata, but we've found a rollback of it,
		// so `revision` must come after all changes in the metadata.
		return Infinity;
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
		if (attachRevisionIndex <= revisionIndex && revisionIndex < detachRevisionIndex) {
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
	metadata: RevisionMetadataSource,
) {
	const revisionIndex = getRevisionIndex(metadata, revision);
	for (let i = cellBlocks.length - 1; i >= 0; i--) {
		const entry = cellBlocks[i];
		if (
			entry.firstAttachedRevisionIndex <= revisionIndex &&
			revisionIndex <= entry.lastAttachedRevisionIndex
		) {
			// These cells were full in this revision, so cells earlier in the sequence
			// do not need to know about this lineage event.
			return;
		}

		// We only add lineage to cells which were detached before the lineage event occurred.
		if (
			entry.cellId !== undefined &&
			(entry.cellId.revision === undefined ||
				revisionIndex > getRevisionIndex(metadata, entry.cellId.revision))
		) {
			addLineageEntry(entry.cellId, revision, id, count, 0);
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

function tryRemoveLineageEvents(lineageHolder: HasLineage, revisionsToRemove: Set<RevisionTag>) {
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
