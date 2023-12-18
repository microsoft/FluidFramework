/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	ChangeAtomId,
	makeAnonChange,
	RevisionMetadataSource,
	RevisionTag,
	tagChange,
	TaggedChange,
} from "../../core";
import { asMutable, brand, fail, fakeIdAllocator, IdAllocator } from "../../util";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import {
	Changeset,
	Mark,
	MarkList,
	NoopMarkType,
	CellId,
	NoopMark,
	CellMark,
	Detach,
} from "./types";
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
	getMoveIn,
} from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	isNoopMark,
	getOffsetInCellRange,
	cloneMark,
	areOutputCellsEmpty,
	areInputCellsEmpty,
	compareLineages,
	isDetach,
	markHasCellEffect,
	withNodeChange,
	withRevision,
	markEmptiesCells,
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
	isImpactfulCellRename,
	settleMark,
	compareCellsFromSameRevision,
} from "./utils";
import { EmptyInputCellMark, VestigialEndpoint } from "./helperTypes";

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
		(a, b) => composeChildChanges(a, b, composeChild),
	);
	while (!queue.isEmpty()) {
		const { baseMark, newMark } = queue.pop();
		if (newMark === undefined) {
			assert(
				baseMark !== undefined,
				0x4db /* Non-empty queue should not return two undefined marks */,
			);
			factory.push(baseMark);
		} else {
			// We only compose changesets that will not be further rebased.
			// It is therefore safe to remove any intentions that have no impact in the context they apply to.
			const settledNewMark = settleMark(newMark, newRev, revisionMetadata);
			if (baseMark === undefined) {
				factory.push(composeMark(settledNewMark, newRev, composeChild));
			} else {
				// Past this point, we are guaranteed that `settledNewMark` and `baseMark` have the same length and
				// start at the same location in the revision after the base changes.
				// They therefore refer to the same range for that revision.
				const composedMark = composeMarks(
					baseMark,
					newRev,
					settledNewMark,
					composeChild,
					genId,
					moveEffects,
					revisionMetadata,
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
function composeMarks<TNodeChange>(
	baseMark: Mark<TNodeChange>,
	newRev: RevisionTag | undefined,
	newMark: Mark<TNodeChange>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): Mark<TNodeChange> {
	let nodeChange = composeChildChanges(
		baseMark.changes,
		newMark.changes === undefined ? undefined : tagChange(newMark.changes, newRev),
		composeChild,
	);
	if (nodeChange !== undefined) {
		const baseSource = getMoveIn(baseMark);
		if (baseSource !== undefined) {
			setModifyAfter(
				moveEffects,
				getEndpoint(baseSource, undefined),
				nodeChange,
				newRev,
				composeChild,
			);
			nodeChange = undefined;
		}
	}
	if (isImpactfulCellRename(newMark, newRev, revisionMetadata)) {
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
			const newDetach: CellMark<Detach, TNodeChange> & Partial<VestigialEndpoint> = {
				...newAttachAndDetach.detach,
				count: baseMark.count,
			};
			// We may need to apply effects to the source location of the base MoveOut so we annotate the mark with
			// information about that location.
			if (isMoveOut(baseMark)) {
				newDetach.vestigialEndpoint = {
					revision: baseMark.revision,
					localId: baseMark.id,
				};
			}
			return withRevision(withNodeChange(newDetach, nodeChange), newDetachRevision);
		}

		if (isImpactfulCellRename(baseMark, undefined, revisionMetadata)) {
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
	if (isImpactfulCellRename(baseMark, undefined, revisionMetadata)) {
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
			assert(newMark.type === NoopMarkType, 0x80a /* Unexpected mark type */);
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
		return withNodeChange(baseMark, nodeChange);
	} else if (areInputCellsEmpty(baseMark)) {
		assert(isDetach(newMark), 0x71c /* Unexpected mark type */);
		assert(isAttach(baseMark), 0x71d /* Expected generative mark */);

		const attach = extractMarkEffect(baseMark);
		const detach = extractMarkEffect(withRevision(newMark, newRev));

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
			nodeChange,
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

			// We return a noop that is annotated with information about the endpoint it used to be because there may
			// be more node changes on `newMark`'s source mark which need to be included here.
			// We will remove the the annotation during `amendCompose` or pruning.
			const vestige: Mark<TNodeChange> & VestigialEndpoint = {
				count: baseMark.count,
				vestigialEndpoint: {
					revision: baseMark.revision,
					localId: baseMark.id,
				},
				changes: composeChildChanges(nodeChange, nodeChanges, composeChild),
			};
			return vestige;
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
	newChange: TaggedChange<TNodeChange> | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TNodeChange | undefined {
	if (newChange === undefined) {
		return baseChange;
	} else if (baseChange === undefined) {
		return composeChild([newChange]);
	} else {
		return composeChild([makeAnonChange(baseChange), newChange]);
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
	const queue = new MarkQueue(marks, undefined, moveEffects, true, fakeIdAllocator, (a, b) =>
		composeChildChanges(a, b, composeChild),
	);

	while (!queue.isEmpty()) {
		const mark = queue.dequeue() as Mark<TNodeChange> & Partial<VestigialEndpoint>;
		if (mark.vestigialEndpoint !== undefined) {
			// Any effects that target this endpoint should have been applied either during the first compose pass,
			// or during the `MarkQueue`'s reading for this pass.
			delete mark.vestigialEndpoint;
		}
		factory.push(mark);
	}

	return factory.list;
}

export class ComposeQueue<T> {
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset<T>,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset<T>,
		genId: IdAllocator,
		moveEffects: MoveEffectTable<T>,
		private readonly revisionMetadata: RevisionMetadataSource,
		composeChanges?: (a: T | undefined, b: TaggedChange<T>) => T | undefined,
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
				baseMark.count,
				newMark,
				this.newRevision,
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
	baseCellCount: number,
	newMark: EmptyInputCellMark<unknown>,
	newIntention: RevisionTag | undefined,
	metadata: RevisionMetadataSource,
): number {
	const newCellId = getInputCellId(newMark, newIntention, metadata);
	assert(newCellId !== undefined, 0x71f /* Should have cell ID */);
	if (baseCellId.revision === newCellId.revision) {
		const comparison = compareCellsFromSameRevision(
			baseCellId,
			baseCellCount,
			newCellId,
			newMark.count,
		);

		if (comparison !== undefined) {
			return comparison;
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
		baseCellCount,
	);
	if (offsetInNew !== undefined) {
		return offsetInNew > 0 ? -offsetInNew : Infinity;
	}

	const cmp = compareLineages(baseCellId, newCellId);
	if (cmp !== 0) {
		return Math.sign(cmp) * Infinity;
	}

	assert(
		baseCellId.revision !== undefined && newCellId.revision !== undefined,
		0x858 /* Cells should have defined revisions */,
	);

	if (!isNewAttach(newMark)) {
		// If `newMark` were targeting a cell older than the composition window
		// there would be lineage determining the relative order of `newCell` and `baseCell`.

		// TODO:6127: Enable this assert
		// assert(
		// 	newRevisionIndex !== undefined,
		// 	"Expected lineage to determine cell order",
		// );

		// `newCell` was detached by a change in this composition, so there will be a corresponding mark
		// later in the base changeset.
		return -Infinity;
	}

	const newRevisionIndex = metadata.getIndex(newCellId.revision);
	const baseRevisionIndex = metadata.getIndex(baseCellId.revision);
	assert(
		newRevisionIndex !== undefined,
		0x859 /* A cell from a new attach should have a defined revision index */,
	);

	// We use the tiebreaking policy of the newer cell.
	return (baseRevisionIndex ?? -Infinity) > newRevisionIndex ? -Infinity : Infinity;
}

// TODO: Reduce the duplication between this and other MoveEffect helpers
function setModifyAfter<T>(
	moveEffects: MoveEffectTable<T>,
	{ revision, localId: id }: ChangeAtomId,
	modifyAfter: T,
	modifyRevision: RevisionTag | undefined,
	composeChanges: NodeChangeComposer<T>,
) {
	const target = CrossFieldTarget.Source;
	const count = 1;
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	let newEffect: MoveEffect<T>;
	if (effect.value !== undefined) {
		const nodeChange =
			effect.value.modifyAfter !== undefined
				? composeChanges([effect.value.modifyAfter, tagChange(modifyAfter, modifyRevision)])
				: modifyAfter;
		newEffect = { ...effect.value, modifyAfter: makeAnonChange(nodeChange) };
	} else {
		newEffect = { modifyAfter: tagChange(modifyAfter, modifyRevision) };
	}
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

function setEndpoint(
	moveEffects: MoveEffectTable<unknown>,
	target: CrossFieldTarget,
	id: ChangeAtomId,
	count: number,
	endpoint: ChangeAtomId,
) {
	const effect = getMoveEffect(moveEffects, target, id.revision, id.localId, count);
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

function offsetChangeAtomId(id: ChangeAtomId, offset: number): ChangeAtomId {
	return { ...id, localId: brand(id.localId + offset) };
}
