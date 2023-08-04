/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { asMutable, brand, fail } from "../../util";
import {
	ChangeAtomId,
	CrossFieldManager,
	CrossFieldTarget,
	getIntention,
	IdAllocator,
	RevisionMetadataSource,
} from "../modular-schema";
import { Changeset, Mark, MarkList, MoveId, NoopMarkType, CellId, NoopMark } from "./format";
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
	isNoopMark,
	getOffsetInCellRange,
	cloneMark,
	isDeleteMark,
	areOutputCellsEmpty,
	areInputCellsEmpty,
	getCellId,
	compareLineages,
	isNewAttach,
	isDetachMark,
	markHasCellEffect,
	withNodeChange,
	getMarkMoveId,
	withRevision,
	markEmptiesCells,
	splitMark,
	markIsTransient,
	isGenerativeMark,
	areOverlappingIdRanges,
} from "./utils";
import { GenerativeMark, EmptyInputCellMark } from "./helperTypes";

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

	if (markIsTransient(newMark)) {
		return withNodeChange(baseMark, nodeChange);
	}
	if (markIsTransient(baseMark)) {
		if (isGenerativeMark(newMark)) {
			// TODO: Make `withNodeChange` preserve type information so we don't need to cast here
			const nonTransient = withNodeChange(
				baseMark,
				nodeChange,
			) as GenerativeMark<TNodeChange>;
			delete nonTransient.transientDetach;
			return nonTransient;
		}
		// Noop and Placeholder marks must be muted because the node they target has been deleted.
		// Detach marks must be muted because the cell is empty.
		if (
			newMark.type === NoopMarkType ||
			newMark.type === "Placeholder" ||
			isDetachMark(newMark)
		) {
			assert(
				newMark.cellId !== undefined,
				0x718 /* Invalid node-targeting mark after transient */,
			);
			return baseMark;
		}
		if (newMark.type === "ReturnTo") {
			// It's possible for ReturnTo to occur after a transient, but only if muted ReturnTo.
			// Why possible: if the transient is a revive, then it's possible that the newMark comes from a client that
			// knew about the node, and tried to move it out and return it.
			// Why muted: until we support replacing a node within a cell, only a single specific node will ever occupy
			// a given cell. The presence of a transient mark tells us that node just got deleted. Return marks that
			// attempt to move a deleted node end up being muted.
			assert(
				newMark.isSrcConflicted ?? false,
				0x719 /* Invalid active ReturnTo mark after transient */,
			);
			return baseMark;
		}
		// Because of the rebase sandwich, it is possible for a MoveIn mark to target an already existing cell.
		// This occurs when a branch with a move get rebased over some other branch.
		// However, the branch being rebased over can't be targeting the cell that the MoveIn is targeting,
		// because no concurrent change has the ability to refer to such a cell.
		// Therefore, a MoveIn mark cannot occur after a transient.
		assert(newMark.type !== "MoveIn", 0x71a /* Invalid MoveIn after transient */);
		return baseMark;
	}

	if (!markHasCellEffect(baseMark) && !markHasCellEffect(newMark)) {
		if (isNoopMark(baseMark)) {
			return withNodeChange(newMark, nodeChange);
		} else if (isNoopMark(newMark)) {
			return withNodeChange(baseMark, nodeChange);
		}
		return createNoopMark(newMark.count, nodeChange, getCellId(baseMark, undefined));
	} else if (!markHasCellEffect(baseMark)) {
		return withRevision(withNodeChange(newMark, nodeChange), newRev);
	} else if (!markHasCellEffect(newMark)) {
		const moveInId = getMarkMoveId(baseMark);
		if (nodeChange !== undefined && moveInId !== undefined) {
			assert(isMoveMark(baseMark), 0x68e /* Only move marks have move IDs */);
			setModifyAfter(
				moveEffects,
				CrossFieldTarget.Source,
				baseMark.revision,
				baseMark.id,
				baseMark.count,
				nodeChange,
				composeChild,
			);
			return baseMark;
		}
		return withNodeChange(baseMark, nodeChange);
	} else if (areInputCellsEmpty(baseMark)) {
		if (isMoveMark(baseMark) && isMoveMark(newMark)) {
			// `baseMark` must be a move destination since it is filling cells, and `newMark` must be a move source.
			const baseIntention = getIntention(baseMark.revision, revisionMetadata);
			const newIntention = getIntention(newMark.revision ?? newRev, revisionMetadata);
			if (
				areInverseMovesAtIntermediateLocation(
					baseMark,
					baseIntention,
					newMark,
					newIntention,
				)
			) {
				// Send the node change to the source of the move, which is where the modified node is in the input context of the composition.
				if (nodeChange !== undefined) {
					setModifyAfter(
						moveEffects,
						CrossFieldTarget.Source,
						baseMark.revision,
						baseMark.id,
						baseMark.count,
						nodeChange,
						composeChild,
					);
				}
			} else {
				setReplacementMark(
					moveEffects,
					CrossFieldTarget.Source,
					baseMark.revision,
					baseMark.id,
					baseMark.count,
					withRevision(withNodeChange(newMark, nodeChange), newRev),
				);
			}

			return { count: 0 };
		}

		if (isMoveMark(baseMark)) {
			setReplacementMark(
				moveEffects,
				CrossFieldTarget.Source,
				baseMark.revision,
				baseMark.id,
				baseMark.count,
				withRevision(withNodeChange(newMark, nodeChange), newRev),
			);
			return { count: 0 };
		}

		if (isMoveMark(newMark)) {
			// The nodes attached by `baseMark` have been moved by `newMark`.
			// We can represent net effect of the two marks by moving `baseMark` to the destination of `newMark`.
			setReplacementMark(
				moveEffects,
				CrossFieldTarget.Destination,
				newMark.revision ?? newRev,
				newMark.id,
				newMark.count,
				withNodeChange(baseMark, nodeChange),
			);
			return { count: 0 };
		}

		assert(isDeleteMark(newMark), 0x71c /* Unexpected mark type */);
		assert(isGenerativeMark(baseMark), 0x71d /* Expected generative mark */);
		const newMarkRevision = newMark.revision ?? newRev;
		assert(newMarkRevision !== undefined, 0x71e /* Unable to compose anonymous marks */);
		return withNodeChange(
			{
				...baseMark,
				transientDetach: {
					revision: newMarkRevision,
					localId: newMark.id,
				},
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
	const mark: NoopMark<TNodeChange> = { count: length };
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
	if (isNoopMark(mark)) {
		return mark;
	}

	const cloned = cloneMark(mark);
	if (
		cloned.cellId !== undefined &&
		cloned.cellId.revision === undefined &&
		revision !== undefined
	) {
		asMutable(cloned.cellId).revision = revision;
	}

	assert(!isNoopMark(cloned), 0x4de /* Cloned should be same type as input mark */);
	if (revision !== undefined && cloned.revision === undefined) {
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
	const factory = new MarkListFactory<TNodeChange>();
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
		switch (mark.type) {
			case "MoveOut":
			case "ReturnFrom": {
				const replacementMark = getReplacementMark(
					moveEffects,
					CrossFieldTarget.Source,
					mark.revision,
					mark.id,
					mark.count,
				);
				mark = replacementMark ?? mark;
				break;
			}
			case "MoveIn":
			case "ReturnTo": {
				const replacementMark = getReplacementMark(
					moveEffects,
					CrossFieldTarget.Destination,
					mark.revision,
					mark.id,
					mark.count,
				);
				mark = replacementMark ?? mark;
				break;
			}
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
			let baseCellId: ChangeAtomId;
			if (markIsTransient(baseMark)) {
				baseCellId = baseMark.transientDetach;
			} else if (markEmptiesCells(baseMark)) {
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
					localId: baseMark.id,
				};
			} else if (baseMark.type === "MoveIn") {
				const baseRevision = baseMark.revision ?? this.baseMarks.revision;
				const baseIntention = getIntention(baseRevision, this.revisionMetadata);
				assert(baseIntention !== undefined, 0x706 /* Base mark must have an intention */);
				baseCellId = { revision: baseIntention, localId: baseMark.id };
			} else {
				assert(
					areInputCellsEmpty(baseMark),
					0x696 /* Mark with empty output must either be a detach or also have input empty */,
				);
				baseCellId = baseMark.cellId;
			}
			const cmp = compareCellPositions(
				baseCellId,
				baseMark,
				newMark,
				this.newRevision,
				this.cancelledInserts,
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

	private dequeueNew(length: number = 0): ComposeMarks<T> {
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
		0x6e9 /* Expected effect to cover entire mark */,
	);

	let mark = effect.value.mark;
	assert(
		mark.count === effect.length,
		0x6ea /* Expected replacement mark to be same length as number of cells replaced */,
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
			0x6eb /* Expected effect to cover entire mark */,
		);
		newEffect = { ...effect.value, mark };
	} else {
		newEffect = { mark };
	}
	setMoveEffect(moveEffects, target, revision, id, count, newEffect);
}

interface ComposeMarks<T> {
	baseMark?: Mark<T>;
	newMark?: Mark<T>;
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

	if (baseMark.type === "ReturnTo" && baseMark.cellId?.revision === newIntention) {
		return true;
	}

	if (newMark.type === "ReturnFrom" && newMark.cellId?.revision === baseIntention) {
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
	baseCellId: CellId,
	baseMark: Mark<unknown>,
	newMark: EmptyInputCellMark<unknown>,
	newIntention: RevisionTag | undefined,
	cancelledInserts: Set<RevisionTag>,
): number {
	const newCellId = getCellId(newMark, newIntention);
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
			0x6ec /* Expected effect to cover entire mark */,
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
