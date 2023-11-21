/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ChangeAtomId, makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { asMutable, fail, fakeIdAllocator, IdAllocator } from "../../util";
import {
	CrossFieldManager,
	CrossFieldTarget,
	getIntention,
	RevisionMetadataSource,
} from "../modular-schema";
import { Changeset, Mark, MarkList, NoopMarkType, CellId, NoopMark, CellMark } from "./format";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import {
	getMoveEffect,
	setMoveEffect,
	isMoveMark,
	MoveEffectTable,
	getModifyAfter,
	MoveEffect,
	isMoveIn,
	isMoveOut,
} from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	isNoopMark,
	getOffsetInCellRange,
	cloneMark,
	isDeleteMark,
	areOutputCellsEmpty,
	areInputCellsEmpty,
	compareLineages,
	isDetach,
	markHasCellEffect,
	withNodeChange,
	withRevision,
	markEmptiesCells,
	areOverlappingIdRanges,
	isNewAttach,
	getInputCellId,
	isAttach,
	getOutputCellId,
	markFillsCells,
	extractMarkEffect,
	getEndpoint,
	areEqualCellIds,
	addRevision,
	normalizeCellRename,
	asAttachAndDetach,
	isCellRename,
} from "./utils";
import { EmptyInputCellMark } from "./helperTypes";

/**
 * @alpha
 */
export type NodeChangeComposer<TNodeChange> = (changes: TaggedChange<TNodeChange>[]) => TNodeChange;

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
export function compose<TNodeChange>(
	changes: TaggedChange<Changeset<TNodeChange>>[],
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
	revisionMetadata: RevisionMetadataSource,
): Changeset<TNodeChange> {
	let composed: Changeset<TNodeChange> = [];
	for (const change of changes) {
		composed = composeMarkLists(
			composed,
			change.revision,
			change.change,
			composeChild,
			genId,
			manager as MoveEffectTable<TNodeChange>,
			revisionMetadata,
		);
	}
	return composed;
}

function composeMarkLists<TNodeChange>(
	baseMarkList: MarkList<TNodeChange>,
	newRev: RevisionTag | undefined,
	newMarkList: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();
	const queue = new ComposeQueue(
		undefined,
		baseMarkList,
		newRev,
		newMarkList,
		genId,
		moveEffects,
		revisionMetadata,
		(a, b) => composeChildChanges(a, b, newRev, composeChild),
	);
	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(baseMark);
		} else if (baseMark === undefined) {
			factory.push(composeMark(newMark, newRev, composeChild));
		} else {
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			const composedMark = composeMarks(
				baseMark,
				newRev,
				newMark,
				composeChild,
				genId,
				moveEffects,
				revisionMetadata,
			);
			factory.push(composedMark);
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
function composeMarks<TNodeChange>(
	baseMark: Mark<TNodeChange>,
	newRev: RevisionTag | undefined,
	newMark: Mark<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): Mark<TNodeChange> {
	const nodeChange = composeChildChanges(baseMark.changes, newMark.changes, newRev, composeChild);
	if (isCellRename(newMark)) {
		const newAttachAndDetach = asAttachAndDetach(newMark);
		const newDetachRevision = newAttachAndDetach.detach.revision ?? newRev;
		if (markEmptiesCells(baseMark)) {
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
				setEndpoint(
					moveEffects,
					CrossFieldTarget.Destination,
					getEndpoint(baseMark, undefined),
					baseMark.count,
					{ revision: newDetachRevision, localId: newAttachAndDetach.detach.id },
				);
			}

			// baseMark is a detach which cancels with the attach portion of the AttachAndDetach,
			// so we are just left with the detach portion of the AttachAndDetach.
			return withRevision(
				withNodeChange({ ...newAttachAndDetach.detach, count: baseMark.count }, nodeChange),
				newDetachRevision,
			);
		}

		if (isCellRename(baseMark)) {
			const baseAttachAndDetach = asAttachAndDetach(baseMark);
			const newOutputId = getOutputCellId(newAttachAndDetach, newRev, revisionMetadata);
			if (areEqualCellIds(newOutputId, baseAttachAndDetach.cellId)) {
				return withNodeChange(
					{ count: baseAttachAndDetach.count, cellId: baseAttachAndDetach.cellId },
					nodeChange,
				);
			}

			// `newMark`'s attach portion cancels with `baseMark`'s detach portion.
			const originalAttach = { ...baseAttachAndDetach.attach };
			const finalDetach = { ...newAttachAndDetach.detach };
			const detachRevision = finalDetach.revision ?? newRev;
			if (detachRevision !== undefined) {
				finalDetach.revision = detachRevision;
			}

			return normalizeCellRename(
				{
					type: "AttachAndDetach",
					cellId: baseMark.cellId,
					count: baseMark.count,
					attach: originalAttach,
					detach: finalDetach,
				},
				nodeChange,
			);
		}

		return withRevision(normalizeCellRename(newAttachAndDetach, nodeChange), newRev);
	}
	if (isCellRename(baseMark)) {
		const baseAttachAndDetach = asAttachAndDetach(baseMark);
		if (markFillsCells(newMark)) {
			if (isMoveIn(baseAttachAndDetach.attach) && isMoveOut(baseAttachAndDetach.detach)) {
				assert(isMoveIn(newMark), 0x809 /* Unexpected mark type */);
				setEndpoint(
					moveEffects,
					CrossFieldTarget.Source,
					getEndpoint(newMark, newRev),
					baseAttachAndDetach.count,
					{
						revision: baseAttachAndDetach.attach.revision,
						localId: baseAttachAndDetach.attach.id,
					},
				);
			}

			const originalAttach = withRevision(
				withNodeChange(
					{
						...baseAttachAndDetach.attach,
						cellId: baseAttachAndDetach.cellId,
						count: baseAttachAndDetach.count,
					},
					nodeChange,
				),
				baseAttachAndDetach.attach.revision,
			);
			return originalAttach;
		} else {
			// Other mark types have been handled by previous conditional branches.
			assert(
				newMark.type === NoopMarkType || newMark.type === "Placeholder",
				0x80a /* Unexpected mark type */,
			);
			return withNodeChange(baseMark, nodeChange);
		}
	}

	if (!markHasCellEffect(baseMark) && !markHasCellEffect(newMark)) {
		if (isNoopMark(baseMark)) {
			return withNodeChange(newMark, nodeChange);
		} else if (isNoopMark(newMark)) {
			return withNodeChange(baseMark, nodeChange);
		}
		return createNoopMark(
			newMark.count,
			nodeChange,
			getInputCellId(baseMark, undefined, undefined),
		);
	} else if (!markHasCellEffect(baseMark)) {
		return withRevision(withNodeChange(newMark, nodeChange), newRev);
	} else if (!markHasCellEffect(newMark)) {
		if (isMoveIn(baseMark) && nodeChange !== undefined) {
			setModifyAfter(moveEffects, getEndpoint(baseMark, undefined), nodeChange, composeChild);
			return baseMark;
		}
		return withNodeChange(baseMark, nodeChange);
	} else if (areInputCellsEmpty(baseMark)) {
		assert(isDetach(newMark), 0x71c /* Unexpected mark type */);
		assert(isAttach(baseMark), 0x71d /* Expected generative mark */);
		let localNodeChange = nodeChange;

		const attach = extractMarkEffect(baseMark);
		const detach = extractMarkEffect(withRevision(newMark, newRev));

		if (isMoveIn(attach) && nodeChange !== undefined) {
			setModifyAfter(moveEffects, getEndpoint(attach, undefined), nodeChange, composeChild);

			localNodeChange = undefined;
		}

		if (isMoveIn(attach) && isMoveOut(detach)) {
			const finalSource = getEndpoint(attach, undefined);
			const finalDest = getEndpoint(detach, newRev);

			setEndpoint(
				moveEffects,
				CrossFieldTarget.Source,
				finalSource,
				baseMark.count,
				finalDest,
			);

			setEndpoint(
				moveEffects,
				CrossFieldTarget.Destination,
				finalDest,
				baseMark.count,
				finalSource,
			);

			// The `finalEndpoint` field of AttachAndDetach move effect pairs is not used,
			// so we remove it as a normalization.
			delete attach.finalEndpoint;
			delete detach.finalEndpoint;
		}

		if (areEqualCellIds(getOutputCellId(newMark, newRev, revisionMetadata), baseMark.cellId)) {
			// The output and input cell IDs are the same, so this mark has no effect.
			return withNodeChange({ count: baseMark.count, cellId: baseMark.cellId }, nodeChange);
		}
		return normalizeCellRename(
			{
				type: "AttachAndDetach",
				cellId: baseMark.cellId,
				count: baseMark.count,
				attach,
				detach,
			},
			localNodeChange,
		);
	} else {
		if (isMoveMark(baseMark) && isMoveMark(newMark)) {
			// The marks must be inverses, since `newMark` is filling the cells which `baseMark` emptied.
			const nodeChanges = getModifyAfter(
				moveEffects,
				baseMark.revision,
				baseMark.id,
				baseMark.count,
			);

			// We return a placeholder instead of a noop because there may be more node changes on `newMark`'s source mark
			// which need to be included here.
			// We will remove the placeholder during `amendCompose`.
			return {
				type: "Placeholder",
				count: baseMark.count,
				revision: baseMark.revision,
				id: baseMark.id,
				changes: composeChildChanges(nodeChange, nodeChanges, undefined, composeChild),
			};
		}
		const length = baseMark.count;
		return createNoopMark(length, nodeChange);
	}
}

function createNoopMark<TNodeChange>(
	length: number,
	nodeChange: TNodeChange | undefined,
	cellId?: ChangeAtomId,
): Mark<TNodeChange> {
	const mark: CellMark<NoopMark, TNodeChange> = { count: length };
	if (nodeChange !== undefined) {
		assert(length === 1, 0x692 /* A mark with a node change must have length one */);
		mark.changes = nodeChange;
	}
	if (cellId !== undefined) {
		mark.cellId = cellId;
	}
	return mark;
}

function composeChildChanges<TNodeChange>(
	baseChange: TNodeChange | undefined,
	newChange: TNodeChange | undefined,
	newRevision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TNodeChange | undefined {
	if (newChange === undefined) {
		return baseChange;
	} else if (baseChange === undefined) {
		return composeChild([tagChange(newChange, newRevision)]);
	} else {
		return composeChild([makeAnonChange(baseChange), tagChange(newChange, newRevision)]);
	}
}

function composeMark<TNodeChange, TMark extends Mark<TNodeChange>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
	const cloned = cloneMark(mark);
	if (
		cloned.cellId !== undefined &&
		cloned.cellId.revision === undefined &&
		revision !== undefined
	) {
		asMutable(cloned.cellId).revision = revision;
	}

	addRevision(cloned, revision);
	if (cloned.changes !== undefined) {
		cloned.changes = composeChild([tagChange(cloned.changes, revision)]);
		return cloned;
	}

	return cloned;
}

export function amendCompose<TNodeChange>(
	marks: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
): MarkList<TNodeChange> {
	return amendComposeI(marks, composeChild, manager as MoveEffectTable<TNodeChange>);
}

function amendComposeI<TNodeChange>(
	marks: MarkList<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	moveEffects: MoveEffectTable<TNodeChange>,
): MarkList<TNodeChange> {
	const factory = new MarkListFactory<TNodeChange>();
	const queue = new MarkQueue(
		marks,
		undefined,
		moveEffects,
		true,
		fakeIdAllocator,
		// TODO: Should pass in revision for new changes
		(a, b) => composeChildChanges(a, b, undefined, composeChild),
	);

	while (!queue.isEmpty()) {
		let mark = queue.dequeue();
		switch (mark.type) {
			case "Placeholder": {
				const modifyAfter = getModifyAfter(moveEffects, mark.revision, mark.id, mark.count);
				if (modifyAfter !== undefined) {
					const changes = composeChildChanges(
						mark.changes,
						modifyAfter,
						undefined,
						composeChild,
					);
					mark = createNoopMark(mark.count, changes);
				} else {
					mark = createNoopMark(mark.count, mark.changes);
				}
			}
			default:
				break;
		}
		factory.push(mark);
	}

	return factory.list;
}

export class ComposeQueue<T> {
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;
	private readonly cancelledInserts = new Set<RevisionTag>();

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset<T>,
		genId: IdAllocator,
		private readonly moveEffects: MoveEffectTable<T>,
		private readonly revisionMetadata: RevisionMetadataSource,
		composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
	) {
		this.baseMarks = new MarkQueue(
			baseMarks,
			baseRevision,
			moveEffects,
			true,
			genId,
			composeChanges,
		);
		this.newMarks = new MarkQueue(
			newMarks,
			newRevision,
			moveEffects,
			true,
			genId,
			composeChanges,
		);

		// Detect all inserts in the new marks that will be cancelled by deletes in the base marks
		const deletes = new Set<RevisionTag>();
		for (const mark of baseMarks) {
			if (isDeleteMark(mark)) {
				const baseIntention = getIntention(mark.revision, revisionMetadata);
				if (baseIntention !== undefined) {
					deletes.add(baseIntention);
				}
			}
		}
		for (const mark of newMarks) {
			if (mark.type === "Insert") {
				const newRev = mark.revision ?? this.newRevision;
				const newIntention = getIntention(newRev, revisionMetadata);
				if (newIntention !== undefined && deletes.has(newIntention)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					this.cancelledInserts.add(newRev!);
				}
			}
		}
	}

	public isEmpty(): boolean {
		return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
	}

	public pop(): ComposeMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		if (baseMark === undefined && newMark === undefined) {
			return {};
		} else if (baseMark === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const length = getInputLength(newMark!);
			return this.dequeueNew(length);
		} else if (newMark === undefined) {
			const length = getOutputLength(baseMark);
			return this.dequeueBase(length);
		} else if (areOutputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseCellId: ChangeAtomId =
				getOutputCellId(baseMark, this.baseMarks.revision, this.revisionMetadata) ??
				fail("Expected defined output ID");

			if (markEmptiesCells(baseMark) && baseCellId.revision === undefined) {
				// The base revision should always be defined except when squashing changes into a transaction.
				// In the future, we want to support reattaches in the new change here.
				// We will need to be able to order the base mark relative to the new mark by looking at the lineage of the new mark
				// (which will be obtained by rebasing the reattach over interim changes
				// (which requires the local changes to have a revision tag))
				assert(
					isNewAttach(newMark),
					0x695 /* TODO: Assign revision tags to each change in a transaction */,
				);
				return this.dequeueNew();
			}

			const cmp = compareCellPositions(
				baseCellId,
				baseMark,
				newMark,
				this.newRevision,
				this.cancelledInserts,
				this.revisionMetadata,
			);
			if (cmp < 0) {
				return { baseMark: this.baseMarks.dequeueUpTo(-cmp) };
			} else if (cmp > 0) {
				return { newMark: this.newMarks.dequeueUpTo(cmp) };
			} else {
				return this.dequeueBoth();
			}
		} else if (areOutputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else {
			return this.dequeueBoth();
		}
	}

	private dequeueBase(length: number = 0): ComposeMarks<T> {
		const baseMark = this.baseMarks.dequeue();
		return { baseMark, newMark: length > 0 ? { count: length } : undefined };
	}

	private dequeueNew(length: number = 0): ComposeMarks<T> {
		return {
			baseMark: length > 0 ? { count: length } : undefined,
			newMark: this.newMarks.dequeue(),
		};
	}

	private dequeueBoth(): ComposeMarks<T> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x697 /* Cannot dequeue both unless both mark queues are non-empty */,
		);
		const length = Math.min(newMark.count, baseMark.count);
		return {
			baseMark: this.baseMarks.dequeueUpTo(length),
			newMark: this.newMarks.dequeueUpTo(length),
		};
	}
}

interface ComposeMarks<T> {
	baseMark?: Mark<T>;
	newMark?: Mark<T>;
}

// TODO: Try to share more logic with the version in rebase.ts.
/**
 * Returns a number N which encodes how the cells of the two marks are aligned.
 * - If N is zero, then the first cell of `baseMark` is the same as the first cell of `newMark`.
 * - If N is positive, then the first N cells of `newMark` (or all its cells if N is greater than its length)
 * are before the first cell of `baseMark`.
 * - If N is negative, then the first N cells of `baseMark` (or all its cells if N is greater than its length)
 * are before the first cell of `newMark`.
 */
function compareCellPositions(
	baseCellId: CellId,
	baseMark: Mark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	newIntention: RevisionTag | undefined,
	cancelledInserts: Set<RevisionTag>,
	metadata: RevisionMetadataSource,
): number {
	const newCellId = getInputCellId(newMark, newIntention, metadata);
	assert(newCellId !== undefined, 0x71f /* Should have cell ID */);
	if (baseCellId.revision === newCellId.revision) {
		if (isNewAttach(newMark)) {
			// There is some change foo that is being cancelled out as part of a rebase sandwich.
			// The marks that make up this change (and its inverse) may be broken up differently between the base
			// changeset and the new changeset because either changeset may have been composed with other changes
			// whose marks may now be interleaved with the marks that represent foo/its inverse.
			// This means that the base and new marks may not be of the same length.
			// We do however know that the all of the marks for foo will appear in the base changeset and all of the
			// marks for the inverse of foo will appear in the new changeset, so we can be confident that whenever
			// we encounter such pairs of marks, they do line up such that they describe changes to the same first
			// cell. This means we can safely treat them as inverses of one another.
			return 0;
		}

		if (
			areOverlappingIdRanges(
				baseCellId.localId,
				baseMark.count,
				newCellId.localId,
				newMark.count,
			)
		) {
			return baseCellId.localId - newCellId.localId;
		}
	}

	const offsetInBase = getOffsetInCellRange(
		baseCellId.lineage,
		newCellId.revision,
		newCellId.localId,
		newMark.count,
	);
	if (offsetInBase !== undefined) {
		return offsetInBase > 0 ? offsetInBase : -Infinity;
	}

	const offsetInNew = getOffsetInCellRange(
		newCellId.lineage,
		baseCellId.revision,
		baseCellId.localId,
		baseMark.count,
	);
	if (offsetInNew !== undefined) {
		return offsetInNew > 0 ? -offsetInNew : Infinity;
	}

	const cmp = compareLineages(baseCellId.lineage, newCellId.lineage);
	if (cmp !== 0) {
		return Math.sign(cmp) * Infinity;
	}

	if (
		newIntention !== undefined &&
		newMark.type === "Insert" &&
		cancelledInserts.has(newIntention)
	) {
		// We know the new insert is getting cancelled out so we need to delay returning it.
		// The base mark that cancels the insert must appear later in the base marks.
		return -Infinity;
	}

	if (isNewAttach(newMark)) {
		// When the marks are at the same position, we use the tiebreak of `newMark`.
		// TODO: Use specified tiebreak instead of always tiebreaking left.
		return Infinity;
	}

	// We know `newMark` points to cells which were emptied before `baseMark` was created,
	// because otherwise `baseMark` would have lineage refering to the emptying of the cell.
	// We use `baseMark`'s tiebreak policy as if `newMark`'s cells were created concurrently and before `baseMark`.
	// TODO: Use specified tiebreak instead of always tiebreaking left.
	if (isNewAttach(baseMark)) {
		return -Infinity;
	}

	// If `newMark`'s lineage does not overlap with `baseMark`'s,
	// then `newMark` must be referring to cells which were created after `baseMark` was applied.
	// The creation of those cells should happen in this composition, so they must be later in the base mark list.
	// This is true because there may be any number of changesets between the base and new changesets, which the new changeset might be refering to the cells of.
	return -Infinity;
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function setModifyAfter<T>(
	moveEffects: MoveEffectTable<T>,
	{ revision, localId: id }: ChangeAtomId,
	modifyAfter: T,
	composeChanges: NodeChangeComposer<T>,
) {
	const target = CrossFieldTarget.Source;
	const count = 1;
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	let newEffect: MoveEffect<T>;
	assert(effect.length === count, 0x6ec /* Expected effect to cover entire mark */);
	if (effect.value !== undefined) {
		const nodeChange =
			effect.value.modifyAfter !== undefined
				? composeChanges([
						makeAnonChange(effect.value.modifyAfter),
						tagChange(modifyAfter, revision),
				  ])
				: modifyAfter;
		newEffect = { ...effect.value, modifyAfter: nodeChange };
	} else {
		newEffect = { modifyAfter };
	}
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

function setEndpoint(
	moveEffects: MoveEffectTable<unknown>,
	target: CrossFieldTarget,
	{ revision, localId: id }: ChangeAtomId,
	count: number,
	endpoint: ChangeAtomId,
) {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, 0x80b /* Expected effect to cover entire mark */);
	const newEffect = effect.value !== undefined ? { ...effect.value, endpoint } : { endpoint };

	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}
