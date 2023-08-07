/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ITreeCursorSynchronous,
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
} from "../../core";
import { brand, fail, Mutable } from "../../util";
import {
	areChangeAtomIdsEqual,
	ChangeAtomId,
	CrossFieldManager,
	CrossFieldTarget,
	getIntention,
	IdAllocator,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	Changeset,
	Mark,
	MarkList,
	Modify,
	PlaceMark,
	CellsMark,
	CellChanges,
	CellChange,
} from "./types";
import { GapTracker, IndexTracker } from "./tracker";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import {
	getMoveEffect,
	setMoveEffect,
	isMoveMark,
	MoveEffectTable,
	MoveMark,
	getModifyAfter,
	MoveEffect,
} from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	getOffsetAtRevision,
	isDeleteMark,
	areOutputCellsEmpty,
	areInputCellsEmpty,
	getCellId,
	compareLineages,
	isNewAttach,
	isExistingCellMark,
	getMarkLength,
	isDetachMark,
	getNodeChange,
	markHasCellEffect,
	withNodeChange,
	getMarkMoveId,
	withRevision,
	markEmptiesCells,
	splitMark,
	isMoveIn,
	isActiveMoveIn,
	isDelete,
} from "./utils";

/**
 * @alpha
 */
export type NodeChangeComposer<TNodeChange> = (changes: TaggedChange<TNodeChange>[]) => TNodeChange;

type WipCellChanges<TNodeChange, TTree> = Mutable<CellChange<TNodeChange, TTree>>[];

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
export function compose<TNodeChange, TTree = ITreeCursorSynchronous>(
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

function composeMarkLists<TNodeChange, TTree>(
	baseMarkList: MarkList<TNodeChange, TTree>,
	newRev: RevisionTag | undefined,
	newMarkList: MarkList<TNodeChange, TTree>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): MarkList<TNodeChange, TTree> {
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
			factory.push(composeNewMark(newMark, newRev, composeChild));
		} else {
			// Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
			// start at the same location in the revision after the base changes.
			// They therefore refer to the same range for that revision.
			const composedMark = composeMarks(
				{ baseMark, newMark },
				newRev,
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

function composeNewMark<TNodeChange, TTree, TMark extends Mark<TNodeChange, TTree>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
	const clone: Mutable<PlaceMark<TNodeChange, TTree> | CellsMark<TNodeChange, TTree>> = {
		...mark,
	};
	if (revision !== undefined && mark.revision === undefined) {
		clone.revision = revision;
	}
	if (clone.lineage !== undefined) {
		clone.lineage = [...clone.lineage];
	}
	clone.payload =
		clone.type === "Place"
			? {
					...clone.payload,
					changes: composeNewCellChanges(
						clone.payload.changes,
						clone.revision ?? revision,
						composeChild,
					),
			  }
			: composeNewCellChanges(clone.payload, clone.revision ?? revision, composeChild);
	return clone as TMark;
}

export function composeNewCellChanges<TNodeChange, TTree>(
	cellChanges: CellChanges<TNodeChange, TTree>,
	revision: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
): CellChanges<TNodeChange, TTree> {
	const clones: CellChange<TNodeChange, TTree>[] = [];
	for (const cellChange of cellChanges) {
		const clone: Mutable<CellChange<TNodeChange, TTree>> = { ...cellChange };
		if (clone.type === "Modify") {
			clone.changes = composeChild([tagChange(clone.changes, revision)]);
		} else if (clone.type === "Fill" && Array.isArray(clone.src)) {
			clone.src = [...clone.src];
		}
		clones.push(clone);
	}
	return clones;
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
function composeMarks<TNodeChange, TTree>(
	{ baseMark, newMark }: ComposableMarks<TNodeChange, TTree>,
	newRev: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): Mark<TNodeChange, TTree> {
	if (baseMark.type === "Place") {
		const changes = composeCellChanges(
			baseMark.payload.changes,
			newMark.payload,
			newMark.count,
			newMark.detachEvent !== undefined,
			newRev,
			composeChild,
			genId,
			moveEffects,
			revisionMetadata,
		);
		return { ...baseMark, payload: { ...baseMark.payload, changes } };
	} else {
		const changes = composeCellChanges(
			baseMark.payload,
			newMark.payload,
			newMark.count,
			newMark.detachEvent !== undefined,
			newRev,
			composeChild,
			genId,
			moveEffects,
			revisionMetadata,
		);
		return { ...baseMark, payload: changes };
	}
}

function composeCellChanges<TNodeChange, TTree>(
	baseChanges: CellChanges<TNodeChange, TTree>,
	newChanges: CellChanges<TNodeChange, TTree>,
	count: number,
	// baseStartsEmpty: boolean,
	newStartsEmpty: boolean,
	newRev: RevisionTag | undefined,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<TNodeChange>,
	revisionMetadata: RevisionMetadataSource,
): CellChanges<TNodeChange, TTree> {
	if (baseChanges.length === 0) {
		return newChanges;
	}
	if (newChanges.length === 0) {
		return baseChanges;
	}
	let cellIsEmpty = newStartsEmpty;
	// This cast should be safe because we ensure that the base mark's cell changes array is cloned.
	// TODO: capture that fact in the type system so we can compiler-enforce it.
	const wipBaseChange = baseChanges as WipCellChanges<TNodeChange, TTree>;
	for (const newChange of newChanges) {
		if (newChange.type === "Modify") {
			// We can start iterating from the end of baseChanges because we know that any new changes that have
			// already been added to wipBaseChange do not contain a relevant cell change.
			let iBase = baseChanges.length - 1;
			while (iBase >= 0) {
				const baseChange = wipBaseChange[iBase];
				if (
					baseChange.type === "Modify" &&
					areChangeAtomIdsEqual(baseChange.detachEvent, newChange.detachEvent)
				) {
					// baseChange modifies the same node.
					baseChange.changes = composeChild([
						makeAnonChange(baseChange.changes),
						tagChange(newChange.changes, newRev),
					]);
					break;
				} else if (isActiveMoveIn(baseChange)) {
					if (newChange.detachEvent !== undefined) {
						// baseChange moves-in the node that is being modified by newChange.
						// We must send the modification to the source cell.
						setModifyAfter(
							moveEffects,
							CrossFieldTarget.Source,
							baseChange.revision,
							baseChange.id,
							count,
							newChange.changes,
							composeChild,
						);
						break;
					} else {
						// How can we tell if the node being modified by newChange is the node moved in by baseChange?
						// If we assume that a cell will only ever be occupied by a single node, then all active
						// move-ins in this cell must be carrying the node that is being modified by newChange.
						// TODO: support different nodes in a cell.
						setModifyAfter(
							moveEffects,
							CrossFieldTarget.Source,
							baseChange.revision,
							baseChange.id,
							count,
							newChange.changes,
							composeChild,
						);
						break;
					}
				} else if (baseChange.type === "Clear") {
					const baseRev = baseChange.revision;
					assert(baseRev !== undefined, "Base marks should have a revision");
					const detachEvent: ChangeAtomId = { revision: baseRev, localId: baseChange.id };
					if (areChangeAtomIdsEqual(detachEvent, newChange.detachEvent)) {
						// baseChange deletes the node that is being modified by newChange.
						// If a similar Modify or a relevant MoveIn were present in the baseChange, we would have
						// encountered it already.
						iBase = -1;
						break;
					}
				}
				iBase -= 1;
			}
			if (iBase < 0) {
				wipBaseChange.push(newChange);
			}
		} else if (isDelete(newChange)) {
			// We can start iterating from the end of baseChanges because we know that any new changes that have
			// already been added to wipBaseChange do not contain a relevant cell change.
			let iBase = baseChanges.length - 1;
			while (iBase >= 0) {
				const baseChange = wipBaseChange[iBase];
				if (isActiveMoveIn(baseChange)) {
					if (newChange.detachEvent !== undefined) {
						// baseChange moves-in the node that is being modified by newChange.
						// We must send the modification to the source cell.
						setModifyAfter(
							moveEffects,
							CrossFieldTarget.Source,
							baseChange.revision,
							baseChange.id,
							count,
							newChange.changes,
							composeChild,
						);
						break;
					} else {
						// How can we tell if the node being modified by newChange is the node moved in by baseChange?
						// If we assume that a cell will only ever be occupied by a single node, then all active
						// move-ins in this cell must be carrying the node that is being modified by newChange.
						// TODO: support different nodes in a cell.
						setModifyAfter(
							moveEffects,
							CrossFieldTarget.Source,
							baseChange.revision,
							baseChange.id,
							count,
							newChange.changes,
							composeChild,
						);
						break;
					}
				} else if (baseChange.type === "Clear") {
					const baseRev = baseChange.revision;
					assert(baseRev !== undefined, "Base marks should have a revision");
					const detachEvent: ChangeAtomId = { revision: baseRev, localId: baseChange.id };
					if (areChangeAtomIdsEqual(detachEvent, newChange.detachEvent)) {
						// baseChange deletes the node that is being modified by newChange.
						// If a similar Modify or a relevant MoveIn were present in the baseChange, we would have
						// encountered it already.
						iBase = -1;
						break;
					}
				}
				iBase -= 1;
			}
			if (iBase < 0) {
				wipBaseChange.push(newChange);
			}
		} else {
			wipBaseChange.push(newChange);
		}
	}
	// const baseChange = baseChanges[baseChanges.length - 1];
	// if (baseChange.type === "Modify") {
	// 	const newChange = newChanges[0];
	// 	if (newChange.type === "Modify") {
	// 		const composedChildChanges = composeChildChanges(
	// 			baseChange,
	// 			newChange,
	// 			newRev,
	// 			composeChild,
	// 		);
	// 		return [...baseChanges.slice(0, -1), composedChildChanges, ...newChanges.slice(1)];
	// 	}
	// }
	return wipBaseChange;
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

// function composeChildChanges<TNodeChange>(
// 	baseChange: Modify<TNodeChange>,
// 	newChange: Modify<TNodeChange>,
// 	newRevision: RevisionTag | undefined,
// 	composeChild: NodeChangeComposer<TNodeChange>,
// ): Modify<TNodeChange> {
// 	return {
// 		type: "Modify",
// 		changes: composeChild([
// 			makeAnonChange(baseChange.changes),
// 			tagChange(newChange.changes, newRevision),
// 		]),
// 	};
// }

export function amendCompose<TNodeChange, TTree>(
	marks: MarkList<TNodeChange, TTree>,
	composeChild: NodeChangeComposer<TNodeChange>,
	genId: IdAllocator,
	manager: CrossFieldManager,
): MarkList<TNodeChange, TTree> {
	return marks;
}

export class ComposeQueue<TNodeChange, TTree> {
	private readonly baseMarks: MarkQueue<TNodeChange, TTree>;
	private readonly newMarks: MarkQueue<TNodeChange, TTree>;
	private readonly baseIndex: IndexTracker;
	private readonly baseGap: GapTracker;
	private readonly cancelledInserts: Set<RevisionTag> = new Set();

	public constructor(
		baseRevision: RevisionTag | undefined,
		baseMarks: Changeset<TNodeChange, TTree>,
		private readonly newRevision: RevisionTag | undefined,
		newMarks: Changeset<TNodeChange, TTree>,
		genId: IdAllocator,
		private readonly moveEffects: MoveEffectTable<TNodeChange>,
		private readonly revisionMetadata: RevisionMetadataSource,
		composeChanges?: (
			a: TNodeChange | undefined,
			b: TNodeChange | undefined,
		) => TNodeChange | undefined,
	) {
		this.baseIndex = new IndexTracker(revisionMetadata.getIndex);
		this.baseGap = new GapTracker(revisionMetadata.getIndex);
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

	public pop(): Partial<ComposableMarks<TNodeChange, TTree>> {
		const output = this.popImpl();
		if (output.baseMark !== undefined) {
			this.baseIndex.advance(output.baseMark);
			this.baseGap.advance(output.baseMark);
		}
		return output;
	}

	private popImpl(): Partial<ComposableMarks<TNodeChange, TTree>> {
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
			// TODO: `baseMark` might be a MoveIn, which is not an ExistingCellMark.
			// See test "[Move ABC, Return ABC] ↷ Delete B" in sequenceChangeRebaser.spec.ts
			assert(
				isExistingCellMark(baseMark),
				0x693 /* Only existing cell mark can have empty output */,
			);
			let baseCellId: DetachEvent;
			if (markEmptiesCells(baseMark)) {
				assert(isDetachMark(baseMark), 0x694 /* Only detach marks can empty cells */);
				const baseRevision = baseMark.revision ?? this.baseMarks.revision;
				const baseIntention = getIntention(baseRevision, this.revisionMetadata);
				if (baseRevision === undefined || baseIntention === undefined) {
					// The base revision always be defined except when squashing changes into a transaction.
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
				baseCellId = {
					revision: baseIntention,
					index: this.baseIndex.getIndex(baseRevision),
				};
			} else {
				assert(
					areInputCellsEmpty(baseMark),
					0x696 /* Mark with empty output must either be a detach or also have input empty */,
				);
				baseCellId = baseMark.detachEvent;
			}
			const cmp = compareCellPositions(
				baseCellId,
				baseMark,
				newMark,
				this.newRevision,
				this.cancelledInserts,
				this.baseGap,
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

	private dequeueBase(length: number = 0): ComposableMarks<TNodeChange> {
		const baseMark = this.baseMarks.dequeue();

		if (baseMark !== undefined) {
			switch (baseMark.type) {
				case "MoveOut":
				case "ReturnFrom":
					{
						const newMark = getReplacementMark(
							this.moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
							baseMark.count,
						);

						if (newMark !== undefined) {
							return { newMark };
						}
					}
					break;
				default:
					break;
			}
		}

		return { baseMark, newMark: length > 0 ? { count: length } : undefined };
	}

	private dequeueNew(length: number = 0): ComposableMarks<TNodeChange> {
		const newMark = this.newMarks.dequeue();

		if (newMark !== undefined) {
			switch (newMark.type) {
				case "MoveIn":
				case "ReturnTo":
					{
						const baseMark = getReplacementMark(
							this.moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? this.newRevision,
							newMark.id,
							newMark.count,
						);

						if (baseMark !== undefined) {
							return { baseMark };
						}
					}
					break;
				default:
					break;
			}
		}

		return {
			baseMark: length > 0 ? { count: length } : undefined,
			newMark,
		};
	}

	private dequeueBoth(): ComposableMarks<TNodeChange> {
		const baseMark = this.baseMarks.peek();
		const newMark = this.newMarks.peek();
		assert(
			baseMark !== undefined && newMark !== undefined,
			0x697 /* Cannot dequeue both unless both mark queues are non-empty */,
		);
		const length = Math.min(getMarkLength(newMark), getMarkLength(baseMark));
		return {
			baseMark: this.baseMarks.dequeueUpTo(length),
			newMark: this.newMarks.dequeueUpTo(length),
		};
	}
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getReplacementMark<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
): Mark<T> | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	if (effect?.value.mark === undefined) {
		return undefined;
	}

	const lastTargetId = (id as number) + count - 1;
	const lastEffectId = effect.start + effect.length - 1;
	assert(
		effect.start <= id && lastEffectId >= lastTargetId,
		"Expected effect to cover entire mark",
	);

	let mark = effect.value.mark;
	assert(
		getMarkLength(mark) === effect.length,
		"Expected replacement mark to be same length as number of cells replaced",
	);

	// The existing effect may cover more cells than the area we are querying.
	// We only want to return the portion of the replacement mark which covers the cells from this query.
	// We should then delete the replacement mark from the portion of the effect which covers the query range,
	// and trim the replacement marks in the portion of the effect before and after the query range.
	const cellsBefore = id - effect.start;
	if (cellsBefore > 0) {
		const [markBefore, newMark] = splitMark(mark, cellsBefore);
		const effectBefore = { ...effect.value, mark: markBefore };
		setMoveEffect(
			moveEffects,
			target,
			revision,
			brand(effect.start),
			cellsBefore,
			effectBefore,
			false,
		);
		mark = newMark;
	}

	const cellsAfter = lastEffectId - lastTargetId;
	if (cellsAfter > 0) {
		const [newMark, markAfter] = splitMark(mark, cellsAfter);
		const effectAfter = { ...effect.value, mark: markAfter };
		setMoveEffect(
			moveEffects,
			target,
			revision,
			brand(lastTargetId + 1),
			cellsAfter,
			effectAfter,
			false,
		);
		mark = newMark;
	}

	const newEffect = { ...effect.value };
	delete newEffect.mark;
	setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
	return mark;
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function setReplacementMark<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	mark: Mark<T>,
) {
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	let newEffect: MoveEffect<T>;
	if (effect !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			"Expected effect to cover entire mark",
		);
		newEffect = { ...effect.value, mark };
	} else {
		newEffect = { mark };
	}
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

interface ComposableMarks<TNodeChange, TTree> {
	baseMark: Mark<TNodeChange, TTree>;
	newMark: CellsMark<TNodeChange, TTree>;
}

/**
 * Returns whether `baseMark` and `newMark` are inverses.
 * It is assumed that both marks are active, `baseMark` is an attach, and `newMark` is a detach.
 * This means that the marks are at the location of the moved content after the first move takes place, but before the second.
 */
function areInverseMovesAtIntermediateLocation(
	baseMark: MoveMark<unknown>,
	baseIntention: RevisionTag | undefined,
	newMark: MoveMark<unknown>,
	newIntention: RevisionTag | undefined,
): boolean {
	assert(
		(baseMark.type === "MoveIn" || baseMark.type === "ReturnTo") &&
			(newMark.type === "MoveOut" || newMark.type === "ReturnFrom"),
		0x6d0 /* baseMark should be an attach and newMark should be a detach */,
	);

	if (baseMark.type === "ReturnTo" && baseMark.detachEvent?.revision === newIntention) {
		return true;
	}

	if (newMark.type === "ReturnFrom" && newMark.detachEvent?.revision === baseIntention) {
		return true;
	}

	return false;
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
	baseCellId: DetachEvent,
	baseMark: ExistingCellMark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	newIntention: RevisionTag | undefined,
	cancelledInserts: Set<RevisionTag>,
	gapTracker: GapTracker,
): number {
	const newCellId = getCellId(newMark, newIntention);
	if (baseCellId.revision === newCellId?.revision) {
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
		return baseCellId.index - newCellId.index;
	}

	if (newCellId !== undefined) {
		const baseOffset = getOffsetAtRevision(baseMark.lineage, newCellId.revision);
		if (baseOffset !== undefined) {
			// BUG: `newCellId.revision` may not be the revision of a change in the composition.
			const newOffset = gapTracker.getOffset(newCellId.revision);

			// `newOffset` refers to the index of `newMark`'s first cell within the adjacent cells detached in `newCellId.revision`.
			// `offsetInBase` refers to the index of the position between those detached cells where `baseMark`'s cells would be.
			// Note that `baseMark`'s cells were not detached in `newCellId.revision`, as that case is handled above.
			// Therefore, when `offsetInBase === newOffset` `baseMark`'s cells come before `newMark`'s cells,
			// as the nth position between detached cells is before the nth detached cell.
			return baseOffset <= newOffset ? -Infinity : baseOffset - newOffset;
		}
	}

	{
		const newOffset = getOffsetAtRevision(newMark.lineage, baseCellId.revision);
		if (newOffset !== undefined) {
			// BUG: `baseCellId.revision` may not be the revision of a change in the composition.
			const baseOffset = gapTracker.getOffset(baseCellId.revision);
			return newOffset <= baseOffset ? Infinity : baseOffset - newOffset;
		}
	}

	const cmp = compareLineages(baseMark.lineage, newMark.lineage);
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
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	modifyAfter: T,
	composeChanges: NodeChangeComposer<T>,
) {
	const effect = getMoveEffect(moveEffects, target, revision, id, count, false);
	let newEffect: MoveEffect<unknown>;
	if (effect !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			"Expected effect to cover entire mark",
		);
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
