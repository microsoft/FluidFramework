/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { fail } from "../../util";
import {
	CrossFieldManager,
	CrossFieldTarget,
	IdAllocator,
	RevisionMetadataSource,
} from "../modular-schema";
import {
	Changeset,
	Mark,
	MarkList,
	ExistingCellMark,
	EmptyInputCellMark,
	DetachEvent,
	Modify,
} from "./format";
import { GapTracker, IndexTracker } from "./tracker";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import { getMoveEffect, getOrAddEffect, isMoveMark, MoveEffectTable } from "./moveEffectTable";
import {
	getInputLength,
	getOutputLength,
	isSkipMark,
	getOffsetAtRevision,
	isObjMark,
	cloneMark,
	isDeleteMark,
	areOutputCellsEmpty,
	areInputCellsEmpty,
	getCellInputId,
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
} from "./utils";

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
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);
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
		const popped = queue.pop();
		const { baseMark, newMark } = popped;
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

	return amendComposeI(factory.list, composeChild, moveEffects);
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
	const nodeChange = composeChildChanges(
		getNodeChange(baseMark),
		getNodeChange(newMark),
		newRev,
		composeChild,
	);

	// TODO: Handle move effects
	if (!markHasCellEffect(baseMark)) {
		return withRevision(withNodeChange(newMark, nodeChange), newRev);
	} else if (!markHasCellEffect(newMark)) {
		const moveInId = getMarkMoveId(baseMark);
		if (nodeChange !== undefined && moveInId !== undefined) {
			assert(isMoveMark(baseMark), "Only move marks have move IDs");
			getOrAddEffect(
				moveEffects,
				CrossFieldTarget.Source,
				baseMark.revision,
				baseMark.id,
				true,
			).modifyAfter = nodeChange;
			return baseMark;
		}
		return withNodeChange(baseMark, nodeChange);
	} else if (areInputCellsEmpty(baseMark)) {
		const moveInId = getMarkMoveId(baseMark);
		if (moveInId !== undefined) {
			assert(isMoveMark(baseMark), "Only move marks have move IDs");
			getOrAddEffect(
				moveEffects,
				CrossFieldTarget.Source,
				baseMark.revision,
				baseMark.id,
				true,
			).mark = withRevision(withNodeChange(newMark, nodeChange), newRev);
			return 0;
		}

		const moveOutId = getMarkMoveId(newMark);
		if (moveOutId !== undefined) {
			assert(isMoveMark(newMark), "Only move marks have move IDs");

			// The nodes attached by `baseMark` have been moved by `newMark`.
			// We can represent net effect of the two marks by moving `baseMark` to the destination of `newMark`.
			getOrAddEffect(
				moveEffects,
				CrossFieldTarget.Destination,
				newMark.revision ?? newRev,
				newMark.id,
				true,
			).mark = withNodeChange(baseMark, nodeChange);
			return 0;
		} else if (isNewAttach(baseMark) && baseMark.revision === undefined) {
			// This case is to support squashing an attach and detach in the same transaction.
			assert(nodeChange === undefined, "TODO: Support transient inserts");
			return 0;
		}
		// TODO: Create a modify or transient insert mark.
		// const length = getMarkLength(baseMark);
		// return createModifyMark(length, nodeChange, getCellInputId(baseMark, undefined));
		return 0;
	} else {
		const length = getMarkLength(baseMark);
		return createModifyMark(length, nodeChange);
	}
}

function createModifyMark<TNodeChange>(
	length: number,
	nodeChange: TNodeChange | undefined,
	cellId?: DetachEvent,
): Mark<TNodeChange> {
	if (nodeChange === undefined) {
		return cellId === undefined ? length : 0;
	}

	assert(length === 1, "A mark with a node change must have length one");
	const mark: Modify<TNodeChange> = { type: "Modify", changes: nodeChange };
	if (cellId !== undefined) {
		mark.detachEvent = cellId;
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
	if (isSkipMark(mark)) {
		return mark;
	}

	const cloned = cloneMark(mark);
	assert(!isSkipMark(cloned), 0x4de /* Cloned should be same type as input mark */);
	if (revision !== undefined && cloned.type !== "Modify" && cloned.revision === undefined) {
		cloned.revision = revision;
	}

	if (cloned.type !== "MoveIn" && cloned.type !== "ReturnTo" && cloned.changes !== undefined) {
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
	const factory = new MarkListFactory<TNodeChange>(undefined, moveEffects);
	const queue = new MarkQueue(
		marks,
		undefined,
		moveEffects,
		true,
		() => fail("Should not generate IDs"),
		// TODO: Should pass in revision for new changes
		(a, b) => composeChildChanges(a, b, undefined, composeChild),
	);

	while (!queue.isEmpty()) {
		let mark = queue.dequeue();
		if (isObjMark(mark)) {
			switch (mark.type) {
				case "MoveOut":
				case "ReturnFrom": {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Source,
						mark.revision,
						mark.id,
					);
					mark = effect.mark ?? mark;
					delete effect.mark;
					break;
				}
				case "MoveIn":
				case "ReturnTo": {
					const effect = getMoveEffect(
						moveEffects,
						CrossFieldTarget.Destination,
						mark.revision,
						mark.id,
					);
					mark = effect.mark ?? mark;
					delete effect.mark;
					break;
				}
				default:
					break;
			}
		}
		factory.push(mark);
	}

	return factory.list;
}

export class ComposeQueue<T> {
	private readonly baseMarks: MarkQueue<T>;
	private readonly newMarks: MarkQueue<T>;
	private readonly baseIndex: IndexTracker;
	private readonly baseGap: GapTracker;
	private readonly cancelledInserts: Set<RevisionTag> = new Set();

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
			if (isObjMark(mark) && mark.type === "Insert") {
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
		const output = this.popImpl();
		if (output.baseMark !== undefined) {
			this.baseIndex.advance(output.baseMark);
			this.baseGap.advance(output.baseMark);
		}
		return output;
	}

	private popImpl(): ComposeMarks<T> {
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
			assert(isExistingCellMark(baseMark), "Only existing cell mark can have empty output");
			let baseCellId: DetachEvent;
			if (markEmptiesCells(baseMark)) {
				assert(isDetachMark(baseMark), "Only detach marks can empty cells");
				const baseRevision = baseMark.revision ?? this.baseMarks.revision;
				if (baseRevision === undefined) {
					// This case should only happen when squashing a transaction.
					assert(isNewAttach(newMark), "Unhandled case");
					return this.dequeueNew();
				}
				baseCellId = {
					revision: baseRevision,
					index: this.baseIndex.getIndex(baseRevision),
				};
			} else {
				assert(
					areInputCellsEmpty(baseMark),
					"Mark with empty output must either be a detach or also have input empty",
				);
				baseCellId = baseMark.detachEvent;
			}
			const cmp = compareCellPositions(baseCellId, baseMark, newMark, this.newRevision);
			if (cmp < 0) {
				return { baseMark: this.baseMarks.dequeueUpTo(-cmp) };
			} else if (cmp > 0) {
				return { newMark: this.newMarks.dequeueUpTo(cmp) };
			} else {
				const length = Math.min(getMarkLength(baseMark), getMarkLength(newMark));
				return this.dequeueLength(length);
			}
		} else if (areOutputCellsEmpty(baseMark)) {
			return this.dequeueBase();
		} else if (areInputCellsEmpty(newMark)) {
			return this.dequeueNew();
		} else {
			const length = Math.min(getMarkLength(newMark), getMarkLength(baseMark));
			return this.dequeueLength(length);
		}
	}

	private dequeueBase(length: number = 0): ComposeMarks<T> {
		const baseMark = this.baseMarks.dequeue();

		if (baseMark !== undefined && isObjMark(baseMark)) {
			switch (baseMark.type) {
				case "MoveOut":
				case "ReturnFrom":
					{
						const effect = getMoveEffect(
							this.moveEffects,
							CrossFieldTarget.Source,
							baseMark.revision,
							baseMark.id,
						);

						const newMark = effect.mark;
						delete effect.mark;
						if (newMark !== undefined) {
							return { newMark };
						}
					}
					break;
				default:
					break;
			}
		}

		return { baseMark, newMark: length > 0 ? length : undefined };
	}

	private dequeueNew(length: number = 0): ComposeMarks<T> {
		const newMark = this.newMarks.dequeue();

		if (newMark !== undefined && isObjMark(newMark)) {
			switch (newMark.type) {
				case "MoveIn":
				case "ReturnTo":
					{
						const effect = getMoveEffect(
							this.moveEffects,
							CrossFieldTarget.Destination,
							newMark.revision ?? this.newRevision,
							newMark.id,
						);

						const baseMark = effect.mark;
						delete effect.mark;
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
			baseMark: length > 0 ? length : undefined,
			newMark,
		};
	}

	private dequeueLength(length: number): ComposeMarks<T> {
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

function getIntention(
	rev: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): RevisionTag | undefined {
	return rev === undefined ? undefined : revisionMetadata.getInfo(rev).rollbackOf ?? rev;
}

// TODO: Try to share more logic with the version in rebase.ts.
function compareCellPositions(
	baseCellId: DetachEvent,
	baseMark: ExistingCellMark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	newRevision: RevisionTag | undefined,
): number {
	const newId = getCellInputId(newMark, newRevision);
	assert(newId !== undefined, "Should have cell ID");
	if (baseCellId.revision === newId.revision) {
		return baseCellId.index - newId.index;
	}

	// TODO: Function should take in `reattachOffset` and use it to compute offsets.
	// TODO: Reconcile indexes and offsets.
	const offsetInBase = getOffsetAtRevision(baseMark.lineage, newId.revision);
	if (offsetInBase !== undefined) {
		// TODO: Is this block reachable?
		return offsetInBase > newId.index ? offsetInBase - newId.index : -Infinity;
	}

	const offsetInNew = getOffsetAtRevision(newMark.lineage, baseCellId.revision);
	if (offsetInNew !== undefined) {
		return offsetInNew > baseCellId.index ? baseCellId.index - offsetInNew : Infinity;
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

	// `newMark` points to cells which were emptied before `baseMark` was created.
	// We use `baseMark`'s tiebreak policy as if `newMark`'s cells were created concurrently and before `baseMark`.
	// TODO: Use specified tiebreak instead of always tiebreaking left.
	if (isNewAttach(baseMark)) {
		return -Infinity;
	}

	// If `newMark`'s lineage does not overlap with `baseMark`'s,
	// then `newMark` must be referring to cells which were created after `baseMark` was applied.
	// The creation of those cells should happen in this composition, so they must be later in the base mark list.
	return -Infinity;
}
