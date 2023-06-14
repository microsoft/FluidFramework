/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import {
	addToNestedSet,
	fail,
	getOrAddEmptyToMap,
	getOrAddInNestedMap,
	NestedMap,
	nestedSetContains,
	StackyIterator,
	tryGetFromNestedMap,
} from "../../util";
import {
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	IdAllocator,
} from "../modular-schema";
import {
	Attach,
	Detach,
	HasChanges,
	HasRevisionTag,
	HasTiebreakPolicy,
	Insert,
	LineageEvent,
	Mark,
	Modify,
	MoveIn,
	NewAttach,
	MoveOut,
	Reattach,
	ReturnFrom,
	ReturnTo,
	NoopMark,
	Changeset,
	MoveId,
	Revive,
	Delete,
	DetachEvent,
	EmptyInputCellMark,
	ExistingCellMark,
	NoopMarkType,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
	applyMoveEffectsToMark,
	getMoveEffect,
	isMoveMark,
	makeMergeable,
	MoveEffectTable,
	MoveMark,
	splitMove,
} from "./moveEffectTable";

export function isModify<TNodeChange>(mark: Mark<TNodeChange>): mark is Modify<TNodeChange> {
	return mark.type === "Modify";
}

export function isNewAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is NewAttach<TNodeChange> {
	return mark.type === "Insert" || mark.type === "MoveIn";
}

export function isAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is Attach<TNodeChange> {
	return isNewAttach(mark) || isReattach(mark);
}

export function isReattach<TNodeChange>(mark: Mark<TNodeChange>): mark is Reattach<TNodeChange> {
	return mark.type === "Revive" || mark.type === "ReturnTo";
}

export function isActiveReattach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> & { conflictsWith?: undefined } {
	// No need to check Reattach.lastDeletedBy because it can only be set if the mark is conflicted
	return isReattach(mark) && !isConflictedReattach(mark);
}

// TODO: Name is misleading
export function isConflictedReattach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> {
	return isReattach(mark) && isReattachConflicted(mark);
}

// TODO: Name is misleading
export function isReattachConflicted(mark: Reattach<unknown>): boolean {
	return (
		mark.detachEvent === undefined ||
		(mark.inverseOf !== undefined && mark.inverseOf !== mark.detachEvent.revision)
	);
}

export function isReturnMuted(mark: ReturnTo): boolean {
	return mark.isSrcConflicted ?? isReattachConflicted(mark);
}

export function areEqualDetachEvents(a: DetachEvent, b: DetachEvent): boolean {
	return a.index === b.index && a.revision === b.revision;
}

export function getCellId(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
): DetachEvent | undefined {
	if (isNewAttach(mark)) {
		const rev = mark.revision ?? revision;
		if (rev !== undefined) {
			// TODO: Should use an ID for this attach instead of incorrectly specifying the index as 0.
			return { revision: rev, index: 0 };
		}
		return undefined;
	}

	return mark.detachEvent;
}

export function cloneMark<TMark extends Mark<TNodeChange>, TNodeChange>(mark: TMark): TMark {
	const clone = { ...mark };
	if (clone.type === "Insert" || clone.type === "Revive") {
		clone.content = [...clone.content];
	}
	if (isAttach(clone) && clone.lineage !== undefined) {
		clone.lineage = [...clone.lineage];
	}
	return clone;
}

/**
 * @returns `true` iff `lhs` and `rhs`'s `HasTiebreakPolicy` fields are structurally equal.
 */
export function isEqualPlace(
	lhs: Readonly<HasTiebreakPolicy>,
	rhs: Readonly<HasTiebreakPolicy>,
): boolean {
	return (
		lhs.heed === rhs.heed &&
		lhs.tiebreak === rhs.tiebreak &&
		areSameLineage(lhs.lineage ?? [], rhs.lineage ?? [])
	);
}

function areSameLineage(lineage1: LineageEvent[], lineage2: LineageEvent[]): boolean {
	if (lineage1.length !== lineage2.length) {
		return false;
	}

	for (let i = 0; i < lineage1.length; i++) {
		const event1 = lineage1[i];
		const event2 = lineage2[i];
		if (event1.revision !== event2.revision || event1.offset !== event2.offset) {
			return false;
		}
	}

	return true;
}

/**
 * @param mark - The mark to get the length of.
 * @param ignorePairing - When true, the length of a paired mark (e.g. MoveIn/MoveOut) whose matching mark is not active
 * will be treated the same as if the matching mark were active.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: Mark<unknown>, ignorePairing: boolean = false): number {
	return areOutputCellsEmpty(mark) ? 0 : getMarkLength(mark);
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: Mark<unknown>): number {
	return areInputCellsEmpty(mark) ? 0 : getMarkLength(mark);
}

export function markEmptiesCells(mark: Mark<unknown>): boolean {
	return !areInputCellsEmpty(mark) && areOutputCellsEmpty(mark);
}

export function markFillsCells(mark: Mark<unknown>): boolean {
	return areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark);
}

export function markHasCellEffect(mark: Mark<unknown>): boolean {
	return areInputCellsEmpty(mark) !== areOutputCellsEmpty(mark);
}

export function isExistingCellMark<T>(mark: Mark<T>): mark is ExistingCellMark<T> {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
		case "Delete":
		case "Modify":
		case "MoveOut":
		case "ReturnFrom":
		case "ReturnTo":
		case "Revive":
		case "Placeholder":
			return true;
		case "Insert":
		case "MoveIn":
			return false;
		default:
			unreachableCase(type);
	}
}

export function areInputCellsEmpty<T>(mark: Mark<T>): mark is EmptyInputCellMark<T> {
	if (isNewAttach(mark)) {
		return true;
	}

	return mark.detachEvent !== undefined;
}

export function areOutputCellsEmpty(mark: Mark<unknown>): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
		case "Insert":
			return false;
		case "MoveIn":
			return mark.isSrcConflicted ?? false;
		case "Delete":
		case "MoveOut":
			return true;
		case "Modify":
		case "Placeholder":
			return mark.detachEvent !== undefined;
		case "ReturnFrom":
			return mark.detachEvent !== undefined || !mark.isDstConflicted;
		case "ReturnTo":
			return (
				mark.detachEvent !== undefined &&
				((mark.isSrcConflicted ?? false) || isReattachConflicted(mark))
			);
		case "Revive":
			return mark.detachEvent !== undefined && isReattachConflicted(mark);
		default:
			unreachableCase(type);
	}
}

export function getMarkLength(mark: Mark<unknown>): number {
	const type = mark.type;
	switch (type) {
		case "Insert":
			return mark.content.length;
		case "Modify":
			return 1;
		case NoopMarkType:
		case "Delete":
		case "MoveIn":
		case "MoveOut":
		case "ReturnFrom":
		case "ReturnTo":
		case "Revive":
		case "Placeholder":
			return mark.count;
		default:
			unreachableCase(type);
	}
}

export function isNoopMark(mark: Mark<unknown>): mark is NoopMark {
	return mark.type === NoopMarkType;
}

export function getOffsetAtRevision(
	lineage: LineageEvent[] | undefined,
	reattachRevision: RevisionTag | undefined,
): number | undefined {
	if (lineage === undefined || reattachRevision === undefined) {
		return undefined;
	}

	for (const event of lineage) {
		if (event.revision === reattachRevision) {
			return event.offset;
		}
	}

	return undefined;
}

export function isDetachMark<TNodeChange>(
	mark: Mark<TNodeChange> | undefined,
): mark is Detach<TNodeChange> {
	const type = mark?.type;
	return type === "Delete" || type === "MoveOut" || type === "ReturnFrom";
}

export function isDeleteMark<TNodeChange>(
	mark: Mark<TNodeChange> | undefined,
): mark is Delete<TNodeChange> {
	return mark?.type === "Delete";
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark<T>(
	lhs: Mark<T>,
	rhs: Readonly<Mark<T>>,
	revision: RevisionTag | undefined,
	moveEffects: MoveEffectTable<T> | undefined,
	recordMerges: boolean,
): boolean {
	if (rhs.type !== lhs.type) {
		return false;
	}
	const type = rhs.type;
	if (type === NoopMarkType) {
		(lhs as NoopMark).count += rhs.count;
		return true;
	}
	if (type !== "Modify" && rhs.revision !== (lhs as HasRevisionTag).revision) {
		return false;
	}

	if (
		(type !== "MoveIn" && type !== "ReturnTo" && rhs.changes !== undefined) ||
		(lhs as Modify | HasChanges).changes !== undefined
	) {
		return false;
	}

	if (isExistingCellMark(lhs)) {
		assert(isExistingCellMark(rhs), 0x6a6 /* Should be existing cell mark */);
		if (lhs.detachEvent?.revision !== rhs.detachEvent?.revision) {
			return false;
		}

		if (
			lhs.detachEvent !== undefined &&
			lhs.detachEvent.index + getMarkLength(lhs) !== rhs.detachEvent?.index
		) {
			return false;
		}
	}

	switch (type) {
		case "Insert": {
			const lhsInsert = lhs as Insert;
			if (
				isEqualPlace(lhsInsert, rhs) &&
				(lhsInsert.id as number) + lhsInsert.content.length === rhs.id
			) {
				lhsInsert.content.push(...rhs.content);
				return true;
			}
			break;
		}
		case "MoveIn":
		case "ReturnTo": {
			const lhsMoveIn = lhs as MoveIn | ReturnTo;
			if (
				isEqualPlace(lhsMoveIn, rhs) &&
				moveEffects !== undefined &&
				lhsMoveIn.isSrcConflicted === rhs.isSrcConflicted &&
				tryMergeMoves(
					CrossFieldTarget.Destination,
					lhsMoveIn,
					rhs,
					revision,
					moveEffects,
					recordMerges,
				)
			) {
				return true;
			}
			break;
		}
		case "Delete": {
			const lhsDetach = lhs as Detach;
			lhsDetach.count += rhs.count;
			return true;
		}
		case "MoveOut": {
			const lhsMoveOut = lhs as MoveOut<T>;
			if (
				moveEffects !== undefined &&
				tryMergeMoves(
					CrossFieldTarget.Source,
					lhsMoveOut,
					rhs,
					revision,
					moveEffects,
					recordMerges,
				)
			) {
				return true;
			}
			break;
		}
		case "ReturnFrom": {
			const lhsReturn = lhs as ReturnFrom<T>;
			if (
				moveEffects !== undefined &&
				tryMergeMoves(
					CrossFieldTarget.Source,
					lhsReturn,
					rhs,
					revision,
					moveEffects,
					recordMerges,
				)
			) {
				return true;
			}
			break;
		}
		case "Revive": {
			const lhsRevive = lhs as Revive;
			if (lhsRevive.inverseOf === rhs.inverseOf) {
				lhsRevive.content.push(...rhs.content);
				lhsRevive.count += rhs.count;
				return true;
			}
			break;
		}
		default:
			break;
	}
	return false;
}

function tryMergeMoves<T>(
	target: CrossFieldTarget,
	left: MoveMark<T>,
	right: MoveMark<T>,
	revision: RevisionTag | undefined,
	moveEffects: MoveEffectTable<T>,
	recordMerges: boolean,
): boolean {
	const rev = left.revision ?? revision;
	const oppEnd =
		target === CrossFieldTarget.Source ? CrossFieldTarget.Destination : CrossFieldTarget.Source;

	const prevMergeId = getMoveEffect(moveEffects, oppEnd, rev, left.id, false).mergeRight;
	if (prevMergeId !== undefined && prevMergeId !== right.id) {
		makeMergeable(moveEffects, oppEnd, rev, prevMergeId, right.id);
	} else {
		makeMergeable(moveEffects, oppEnd, rev, left.id, right.id);
	}

	const leftEffect = getMoveEffect(moveEffects, target, rev, left.id);
	if (leftEffect.mergeRight === right.id) {
		const rightEffect = getMoveEffect(moveEffects, target, rev, right.id);
		assert(rightEffect.mergeLeft === left.id, 0x56d /* Inconsistent merge info */);
		const nextId = rightEffect.mergeRight;
		if (nextId !== undefined) {
			makeMergeable(moveEffects, target, rev, left.id, nextId);
		} else {
			leftEffect.mergeRight = undefined;
		}

		if (recordMerges) {
			splitMove(moveEffects, target, revision, left.id, right.id, left.count, right.count);

			// TODO: This breaks the nextId mergeability, and would also be overwritten if we merged again
			makeMergeable(moveEffects, target, revision, left.id, right.id);
		}

		left.count += right.count;
		return true;
	}
	return false;
}

interface DetachedNode {
	rev: RevisionTag;
	index: number;
}

/**
 * Keeps track of the different ways detached nodes may be referred to.
 * Allows updating changesets so they refer to a detached node by the details
 * of the last detach that affected them.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 */
export class DetachedNodeTracker {
	// Maps the index for a node to its last characterization as a reattached node.
	private nodes: Map<number, DetachedNode> = new Map();
	private readonly equivalences: { old: DetachedNode; new: DetachedNode }[] = [];

	public constructor() {}

	/**
	 * Updates the internals of this instance to account for `change` having been applied.
	 * @param change - The change that is being applied. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 */
	public apply(change: TaggedChange<Changeset<unknown>>): void {
		let index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (isDetachMark(mark)) {
				const newNodes: Map<number, DetachedNode> = new Map();
				const after = index + inputLength;
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						if (k >= after) {
							newNodes.set(k - inputLength, v);
						} else {
							// The node is removed
							this.equivalences.push({
								old: v,
								new: {
									rev:
										change.rollbackOf ??
										mark.revision ??
										change.revision ??
										fail("Unable to track detached nodes"),
									index: k,
								},
							});
						}
					} else {
						newNodes.set(k, v);
					}
				}
				this.nodes = newNodes;
			}
			index += inputLength;
		}
		index = 0;
		for (const mark of change.change) {
			const inputLength: number = getInputLength(mark);
			if (isActiveReattach(mark)) {
				const newNodes: Map<number, DetachedNode> = new Map();
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						newNodes.set(k + inputLength, v);
					} else {
						newNodes.set(k, v);
					}
				}
				const detachEvent = mark.detachEvent ?? fail("Unable to track detached nodes");
				for (let i = 0; i < mark.count; ++i) {
					newNodes.set(index + i, {
						rev: detachEvent.revision,
						index: detachEvent.index + i,
					});
				}
				this.nodes = newNodes;
			}
			if (!isDetachMark(mark)) {
				index += inputLength;
			}
		}
	}

	/**
	 * Checks whether the given `change` is applicable based on previous changes.
	 * @param change - The change to verify the applicability of. Not mutated.
	 * @returns false iff `change`'s description of detached nodes is inconsistent with that of changes applied
	 * earlier. Returns true otherwise.
	 */
	public isApplicable(change: Changeset<unknown>): boolean {
		for (const mark of change) {
			if (isActiveReattach(mark)) {
				const detachEvent = mark.detachEvent ?? fail("Unable to track detached nodes");
				const rev = detachEvent.revision;
				for (let i = 0; i < mark.count; ++i) {
					const index = detachEvent.index + i;
					const original = { rev, index };
					const updated = this.getUpdatedDetach(original);
					for (const detached of this.nodes.values()) {
						if (updated.rev === detached.rev && updated.index === detached.index) {
							// The new change is attempting to reattach nodes in a location that has already been
							// filled by a prior reattach.
							return false;
						}
					}
				}
			}
		}
		return true;
	}

	/**
	 * Creates an updated representation of the given `change` so that it refers to detached nodes using the revision
	 * that last detached them.
	 * @param change - The change to update. Not mutated.
	 * Must be applicable (i.e., `isApplicable(change)` must be true).
	 * @param genId - An ID allocator that produces ID unique within this changeset.
	 * @returns A change equivalent to `change` that refers to detached nodes using the revision that last detached
	 * them. May reuse parts of the input `change` structure.
	 */
	public update<T>(
		change: TaggedChange<Changeset<T>>,
		genId: IdAllocator,
	): TaggedChange<Changeset<T>> {
		const moveEffects = newMoveEffectTable<T>();
		const factory = new MarkListFactory<T>(change.revision, moveEffects);
		const iter = new StackyIterator(change.change);
		while (!iter.done) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const preSplit = iter.pop()!;
			const splitMarks = applyMoveEffectsToMark(preSplit, change.revision, moveEffects, true);

			const mark = splitMarks[0];
			for (let i = splitMarks.length - 1; i > 0; i--) {
				iter.push(splitMarks[i]);
			}
			const cloned = cloneMark(mark);
			if (isReattach(cloned) && cloned.detachEvent !== undefined) {
				let remainder: Reattach<T> = cloned;
				for (let i = 1; i < cloned.count; ++i) {
					const [head, tail] = splitMark(
						remainder,
						change.revision,
						1,
						genId,
						moveEffects,
						false,
					);
					this.updateMark(head, change.revision, moveEffects);
					factory.push(head);
					remainder = tail;
				}
				this.updateMark(remainder, change.revision, moveEffects);
				factory.push(remainder);
			} else {
				factory.push(cloned);
			}
		}

		// We may need to apply the effects of updateMoveSrcDetacher for some marks if those were located
		// before their corresponding detach mark.
		const factory2 = new MarkListFactory<T>(change.revision, moveEffects);
		for (const mark of factory.list) {
			const splitMarks = applyMoveEffectsToMark(mark, change.revision, moveEffects, true);
			factory2.push(...splitMarks);
		}
		return {
			...change,
			change: factory2.list,
		};
	}

	private updateMark<T>(
		mark: Reattach<T>,
		revision: RevisionTag | undefined,
		moveEffects: MoveEffectTable<T>,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const detachEvent = mark.detachEvent!;
		const original = { rev: detachEvent.revision, index: detachEvent.index };
		const updated = this.getUpdatedDetach(original);
		if (updated.rev !== original.rev || updated.index !== original.index) {
			mark.detachEvent = { revision: updated.rev, index: updated.index };
		}
	}

	private getUpdatedDetach(detach: DetachedNode): DetachedNode {
		let curr = detach;
		for (const eq of this.equivalences) {
			if (curr.rev === eq.old.rev && curr.index === eq.old.index) {
				curr = eq.new;
			}
		}
		return curr;
	}
}

/**
 * Checks whether `branch` changeset is consistent with a `target` changeset that is may be rebased over.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param branch - The changeset that would be rebased over `target`.
 * @param target - The changeset that `branch` would be rebased over.
 * @returns false iff `branch`'s description of detached nodes is inconsistent with that of `target`.
 * Returns true otherwise.
 */
export function areRebasable(branch: Changeset<unknown>, target: Changeset<unknown>): boolean {
	const indexToReattach: Map<number, string[]> = new Map();
	const reattachToIndex: Map<string, number> = new Map();
	let index = 0;
	for (const mark of branch) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const detachEvent = mark.detachEvent ?? fail("Unable to track detached nodes");
				const entry = {
					rev: detachEvent.revision,
					index: detachEvent.index + i,
				};
				const key = `${entry.rev}|${entry.index}`;
				assert(
					!reattachToIndex.has(key),
					0x506 /* First changeset as inconsistent characterization of detached nodes */,
				);
				list.push(key);
				reattachToIndex.set(key, index);
			}
		}
		index += getInputLength(mark);
	}
	index = 0;
	let listIndex = 0;
	for (const mark of target) {
		if (isActiveReattach(mark)) {
			const list = getOrAddEmptyToMap(indexToReattach, index);
			for (let i = 0; i < mark.count; ++i) {
				const detachEvent = mark.detachEvent ?? fail("Unable to track detached nodes");
				const entry = {
					rev: detachEvent.revision,
					index: detachEvent.index + i,
				};
				const key = `${entry.rev}|${entry.index}`;
				const indexInA = reattachToIndex.get(key);
				if (indexInA !== undefined && indexInA !== index) {
					// change b tries to reattach the same content as change a but in a different location
					return false;
				}
				if (list.includes(key)) {
					while (list[listIndex] !== undefined && list[listIndex] !== key) {
						++listIndex;
					}
					if (list.slice(0, listIndex).includes(key)) {
						// change b tries to reattach the same content as change a but in a different order
						return false;
					}
				}
			}
		}
		const inputLength = getInputLength(mark);
		if (inputLength > 0) {
			listIndex = 0;
		}
		index += inputLength;
	}
	return true;
}

/**
 * Checks whether sequential changesets are consistent.
 *
 * WARNING: this code consumes O(N) space and time for marks that affect N nodes.
 * This is code is currently meant for usage in tests.
 * It should be tested and made more efficient before production use.
 *
 * @param changes - The changesets that would be composed together.
 * @returns false iff the changesets in `changes` are inconsistent/incompatible in their description of detached nodes.
 * Returns true otherwise.
 */
export function areComposable(changes: TaggedChange<Changeset<unknown>>[]): boolean {
	const tracker = new DetachedNodeTracker();
	for (const change of changes) {
		if (!tracker.isApplicable(change.change)) {
			return false;
		}
		tracker.apply(change);
	}
	return true;
}

/**
 * @alpha
 */
export interface CrossFieldTable<T = unknown> extends CrossFieldManager<T> {
	srcQueries: CrossFieldQuerySet;
	dstQueries: CrossFieldQuerySet;
	isInvalidated: boolean;
	mapSrc: NestedMap<RevisionTag | undefined, MoveId, T>;
	mapDst: NestedMap<RevisionTag | undefined, MoveId, T>;
	reset: () => void;
}

/**
 * @alpha
 */
export function newCrossFieldTable<T = unknown>(): CrossFieldTable<T> {
	const srcQueries: CrossFieldQuerySet = new Map();
	const dstQueries: CrossFieldQuerySet = new Map();
	const mapSrc: NestedMap<RevisionTag | undefined, MoveId, T> = new Map();
	const mapDst: NestedMap<RevisionTag | undefined, MoveId, T> = new Map();

	const getMap = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? mapSrc : mapDst;

	const getQueries = (target: CrossFieldTarget) =>
		target === CrossFieldTarget.Source ? srcQueries : dstQueries;

	const table = {
		srcQueries,
		dstQueries,
		isInvalidated: false,
		mapSrc,
		mapDst,

		get: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: MoveId,
			addDependency: boolean,
		) => {
			if (addDependency) {
				addToNestedSet(getQueries(target), revision, id);
			}
			return tryGetFromNestedMap(getMap(target), revision, id);
		},
		getOrCreate: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: MoveId,
			defaultValue: T,
			invalidateDependents: boolean,
		) => {
			if (invalidateDependents && nestedSetContains(getQueries(target), revision, id)) {
				table.isInvalidated = true;
			}
			return getOrAddInNestedMap<RevisionTag | undefined, MoveId, T>(
				getMap(target),
				revision,
				id,
				defaultValue,
			);
		},

		reset: () => {
			table.isInvalidated = false;
			table.srcQueries.clear();
			table.dstQueries.clear();
		},
	};

	return table;
}

/**
 * @alpha
 */
export function newMoveEffectTable<T>(): MoveEffectTable<T> {
	return newCrossFieldTable();
}

/**
 * Splits the `mark` into two marks such that the first returned mark has length `length`.
 * @param mark - The mark to split.
 * @param revision - The revision of the changeset the mark is part of.
 * @param length - The desired length for the first of the two returned marks.
 * @param genId - An ID allocator
 * @param moveEffects - The table in which to record splitting of move marks
 * @param recordMoveEffect - Whether when splitting a move an entry should be added to `moveEffects` indicating that the mark should be split (in case we process this mark again).
 * An entry is always added to `moveEffects` indicating that the opposite end of the move should be split.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMark<T, TMark extends Mark<T>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	length: number,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<T>,
	recordMoveEffect: boolean = false,
): [TMark, TMark] {
	const markLength = getMarkLength(mark);
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail("Unable to split mark due to lengths");
	}
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return [{ count: length }, { count: remainder }] as [TMark, TMark];
		case "Modify":
			fail("Unable to split Modify mark of length 1");
		case "Insert":
			return [
				{ ...mark, content: mark.content.slice(0, length) },
				{
					...mark,
					content: mark.content.slice(length),
					id: (mark.id as number) + length,
				},
			];
		case "MoveIn":
		case "ReturnTo": {
			const newId = genId();
			splitMove(
				moveEffects,
				CrossFieldTarget.Source,
				mark.revision ?? revision,
				mark.id,
				newId,
				length,
				remainder,
			);
			if (recordMoveEffect) {
				splitMove(
					moveEffects,
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					newId,
					length,
					remainder,
				);
			}
			const mark1: TMark = { ...mark, count: length };
			const mark2: TMark = { ...mark, id: newId, count: remainder };
			if (mark.type === "ReturnTo") {
				if (mark.detachEvent !== undefined) {
					(mark2 as ReturnTo).detachEvent = splitDetachEvent(mark.detachEvent, length);
				}

				return [mark1, mark2];
			}
			return [mark1, mark2];
		}
		case "Revive": {
			const mark1 = { ...mark, content: mark.content.slice(0, length), count: length };
			const mark2 = {
				...mark,
				content: mark.content.slice(length),
				count: remainder,
			};

			if (mark.detachEvent !== undefined) {
				(mark2 as Revive).detachEvent = splitDetachEvent(mark.detachEvent, length);
			}

			return [mark1, mark2];
		}
		case "Delete": {
			const mark1 = { ...mark, count: length };
			const mark2 = {
				...mark,
				count: remainder,
			};

			if (mark.detachEvent !== undefined) {
				(mark2 as Delete).detachEvent = splitDetachEvent(mark.detachEvent, length);
			}

			return [mark1, mark2];
		}
		case "MoveOut":
		case "ReturnFrom": {
			// TODO: Handle detach index for ReturnFrom
			const newId = genId();
			splitMove(
				moveEffects,
				CrossFieldTarget.Destination,
				mark.revision ?? revision,
				mark.id,
				newId,
				length,
				remainder,
			);
			if (recordMoveEffect) {
				splitMove(
					moveEffects,
					CrossFieldTarget.Source,
					mark.revision ?? revision,
					mark.id,
					newId,
					length,
					remainder,
				);
			}
			const mark1 = { ...mark, count: length };
			const mark2 = {
				...mark,
				id: newId,
				count: remainder,
			};
			if (mark.detachEvent !== undefined) {
				(mark2 as Detach).detachEvent = splitDetachEvent(mark.detachEvent, length);
			}
			return [mark1, mark2];
		}
		case "Placeholder":
			fail("TODO");
		default:
			unreachableCase(type);
	}
}

function splitDetachEvent(detachEvent: DetachEvent, length: number): DetachEvent {
	return { ...detachEvent, index: detachEvent.index + length };
}

export function compareLineages(
	lineage1: LineageEvent[] | undefined,
	lineage2: LineageEvent[] | undefined,
): number {
	if (lineage1 === undefined || lineage2 === undefined) {
		return 0;
	}

	const lineage1Offsets = new Map<RevisionTag, number>();
	for (const event of lineage1) {
		lineage1Offsets.set(event.revision, event.offset);
	}

	for (let i = lineage2.length - 1; i >= 0; i--) {
		const event2 = lineage2[i];
		const offset1 = lineage1Offsets.get(event2.revision);
		if (offset1 !== undefined) {
			const offset2 = event2.offset;
			if (offset1 < offset2) {
				return -1;
			} else if (offset1 > offset2) {
				return 1;
			}
		}
	}
	return 0;
}

export function getNodeChange<TNodeChange>(mark: Mark<TNodeChange>): TNodeChange | undefined {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
		case "MoveIn":
		case "ReturnTo":
			return undefined;
		case "Delete":
		case "Insert":
		case "Modify":
		case "MoveOut":
		case "ReturnFrom":
		case "Revive":
		case "Placeholder":
			return mark.changes;
		default:
			unreachableCase(type);
	}
}

export function withNodeChange<TNodeChange>(
	mark: Mark<TNodeChange>,
	changes: TNodeChange | undefined,
): Mark<TNodeChange> {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return changes !== undefined ? { type: "Modify", changes } : mark;
		case "MoveIn":
		case "ReturnTo":
			assert(
				changes === undefined,
				0x6a7 /* Cannot have a node change on a MoveIn or ReturnTo mark */,
			);
			return mark;
		case "Delete":
		case "Insert":
		case "Modify":
		case "MoveOut":
		case "ReturnFrom":
		case "Revive":
		case "Placeholder": {
			const newMark = { ...mark };
			if (changes !== undefined) {
				newMark.changes = changes;
			} else {
				delete newMark.changes;
			}
			return newMark;
		}
		default:
			unreachableCase(type);
	}
}

export function withRevision<TMark extends Mark<unknown>>(
	mark: TMark,
	revision: RevisionTag | undefined,
): TMark {
	if (revision === undefined) {
		return mark;
	}

	if (isNoopMark(mark)) {
		return mark;
	}

	if (isModify(mark)) {
		return mark;
	}

	const cloned = cloneMark(mark);
	(cloned as Exclude<Mark<unknown>, NoopMark | Modify<unknown>>).revision = revision;
	return cloned;
}

export function getMarkMoveId(mark: Mark<unknown>): MoveId | undefined {
	if (isMoveMark(mark)) {
		return mark.id;
	}

	return undefined;
}
