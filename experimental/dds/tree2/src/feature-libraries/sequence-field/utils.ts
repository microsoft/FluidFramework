/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { brand, fail, getFirstFromRangeMap, getOrAddEmptyToMap, RangeMap } from "../../util";
import {
	addCrossFieldQuery,
	ChangeAtomId,
	ChangesetLocalId,
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "../modular-schema";
import {
	Attach,
	Detach,
	HasRevisionTag,
	Insert,
	LineageEvent,
	Mark,
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
	NoopMarkType,
	Transient,
	HasMarkFields,
	CellId,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { isMoveMark, MoveEffectTable } from "./moveEffectTable";
import { GenerativeMark, TransientMark, EmptyInputCellMark, DetachedCellMark } from "./helperTypes";

export function isEmpty<T>(change: Changeset<T>): boolean {
	return change.length === 0;
}

export function isNewAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is NewAttach<TNodeChange> {
	return mark.type === "Insert" || mark.type === "MoveIn";
}

export function isGenerativeMark<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is GenerativeMark<TNodeChange> {
	return mark.type === "Insert" || mark.type === "Revive";
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
	return mark.cellId === undefined || isRevertOnlyReattachPreempted(mark);
}

/**
 * @returns true iff `mark` is a revert-only inverse that cannot be applied because the target cell was concurrently
 * populated (and possibly emptied) by unrelated changes. Here, "unrelated" specifically means they are not an
 * undo/redo pair of the change this this mark is the inverse of.
 */
function isRevertOnlyReattachPreempted(mark: Reattach<unknown>): boolean {
	return mark.inverseOf !== undefined && mark.inverseOf !== mark.cellId?.revision;
}

export function isReturnMuted(mark: ReturnTo): boolean {
	return mark.isSrcConflicted ?? isReattachConflicted(mark);
}

export function areEqualCellIds(a: CellId | undefined, b: CellId | undefined): boolean {
	if (a === undefined || b === undefined) {
		return a === b;
	}
	return (
		a.localId === b.localId && a.revision === b.revision && areSameLineage(a.lineage, b.lineage)
	);
}

export function getCellId(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
): CellId | undefined {
	const cellId = mark.cellId;
	if (cellId === undefined) {
		return undefined;
	}
	if (cellId.revision === undefined && revision !== undefined) {
		return { ...cellId, revision };
	}
	return cellId;
}

export function cloneMark<TMark extends Mark<TNodeChange>, TNodeChange>(mark: TMark): TMark {
	const clone = { ...mark };
	if (clone.type === "Insert" || clone.type === "Revive") {
		clone.content = [...clone.content];
	}
	if (clone.cellId !== undefined) {
		clone.cellId = { ...clone.cellId };
		if (clone.cellId.lineage !== undefined) {
			clone.cellId.lineage = [...clone.cellId.lineage];
		}
	}
	return clone;
}

function areSameLineage(
	lineage1: LineageEvent[] | undefined,
	lineage2: LineageEvent[] | undefined,
): boolean {
	if (lineage1 === undefined && lineage2 === undefined) {
		return true;
	}

	if (lineage1 === undefined || lineage2 === undefined) {
		return false;
	}

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
	return areOutputCellsEmpty(mark) ? 0 : mark.count;
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: Mark<unknown>): number {
	return areInputCellsEmpty(mark) ? 0 : mark.count;
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

export function markIsTransient<T>(mark: Mark<T>): mark is TransientMark<T> {
	return isGenerativeMark(mark) && mark.transientDetach !== undefined;
}

/**
 * @returns The nested changes from `mark` if they apply to the content the mark refers to.
 */
export function getEffectiveNodeChanges<TNodeChange>(
	mark: Mark<TNodeChange>,
): TNodeChange | undefined {
	const changes = mark.changes;
	if (changes === undefined) {
		return undefined;
	}
	const type = mark.type;
	assert(
		type !== "MoveIn" && type !== "ReturnTo",
		"MoveIn/ReturnTo marks should not have changes",
	);
	switch (type) {
		case "Insert":
			return changes;
		case "Revive":
			// So long as the input cell is populated, the nested changes are still effective
			// (even if the revive is preempted) because the nested changes can only target the node in the populated
			// cell.
			return areInputCellsEmpty(mark) && isRevertOnlyReattachPreempted(mark)
				? undefined
				: changes;
		case NoopMarkType:
		case "Placeholder":
		case "Delete":
		case "MoveOut":
		case "ReturnFrom":
			return areInputCellsEmpty(mark) ? undefined : changes;
		default:
			unreachableCase(type);
	}
}

export function areInputCellsEmpty<T>(mark: Mark<T>): mark is EmptyInputCellMark<T> {
	return mark.cellId !== undefined;
}

export function areOutputCellsEmpty(mark: Mark<unknown>): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
		case "Placeholder":
			return mark.cellId !== undefined;
		case "Insert":
			return mark.transientDetach !== undefined;
		case "MoveIn":
			return mark.isSrcConflicted ?? false;
		case "Delete":
		case "MoveOut":
			return true;
		case "ReturnFrom":
			return mark.cellId !== undefined || !mark.isDstConflicted;
		case "ReturnTo":
			return (
				mark.cellId !== undefined &&
				((mark.isSrcConflicted ?? false) || isReattachConflicted(mark))
			);
		case "Revive":
			return (
				(mark.cellId !== undefined && isReattachConflicted(mark)) ||
				mark.transientDetach !== undefined
			);
		default:
			unreachableCase(type);
	}
}

export function isNoopMark<T>(mark: Mark<T>): mark is NoopMark<T> {
	return mark.type === NoopMarkType;
}

/**
 * @returns The number of cells in the range which come before the position described by `lineage`.
 */
export function getOffsetInCellRange(
	lineage: LineageEvent[] | undefined,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
): number | undefined {
	if (lineage === undefined || revision === undefined) {
		return undefined;
	}

	for (const event of lineage) {
		if (
			event.revision === revision &&
			areOverlappingIdRanges(id, count, event.id, event.count)
		) {
			return (event.id as number) + event.offset - id;
		}
	}

	return undefined;
}

export function areOverlappingIdRanges(
	id1: ChangesetLocalId,
	count1: number,
	id2: ChangesetLocalId,
	count2: number,
): boolean {
	const lastId1 = (id1 as number) + count1 - 1;
	const lastId2 = (id2 as number) + count2 - 1;
	return (id2 <= id1 && id1 <= lastId2) || (id1 <= id2 && id2 <= lastId1);
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

function areMergeableChangeAtoms(
	lhs: ChangeAtomId | undefined,
	lhsCount: number,
	rhs: ChangeAtomId | undefined,
): boolean {
	if (lhs === undefined || rhs === undefined) {
		return lhs === undefined && rhs === undefined;
	}

	return lhs.revision === rhs.revision && (lhs.localId as number) + lhsCount === rhs.localId;
}

function areMergeableCellIds(
	lhs: CellId | undefined,
	lhsCount: number,
	rhs: CellId | undefined,
): boolean {
	return (
		areMergeableChangeAtoms(lhs, lhsCount, rhs) && areSameLineage(lhs?.lineage, rhs?.lineage)
	);
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark<T>(lhs: Mark<T>, rhs: Readonly<Mark<T>>): boolean {
	if (rhs.type !== lhs.type) {
		return false;
	}

	if (!areMergeableCellIds(lhs.cellId, lhs.count, rhs.cellId)) {
		return false;
	}

	if (rhs.changes !== undefined || lhs.changes !== undefined) {
		return false;
	}

	const type = rhs.type;
	if (type === NoopMarkType) {
		(lhs as NoopMark<T>).count += rhs.count;
		return true;
	}

	if (rhs.revision !== (lhs as HasRevisionTag).revision) {
		return false;
	}

	switch (type) {
		case "Insert": {
			const lhsInsert = lhs as Insert;
			if (
				areMergeableChangeAtoms(lhsInsert.transientDetach, lhs.count, rhs.transientDetach)
			) {
				lhsInsert.content.push(...rhs.content);
				lhsInsert.count += rhs.count;
				return true;
			}
			break;
		}
		case "MoveIn": {
			const lhsMoveIn = lhs as MoveIn;
			if (
				lhsMoveIn.isSrcConflicted === rhs.isSrcConflicted &&
				(lhsMoveIn.id as number) + lhsMoveIn.count === rhs.id
			) {
				lhsMoveIn.count += rhs.count;
				return true;
			}
			break;
		}
		case "ReturnTo": {
			const lhsReturnTo = lhs as ReturnTo;
			if (
				lhsReturnTo.inverseOf === rhs.inverseOf &&
				lhsReturnTo.isSrcConflicted === rhs.isSrcConflicted &&
				(lhsReturnTo.id as number) + lhsReturnTo.count === rhs.id
			) {
				lhsReturnTo.count += rhs.count;
				return true;
			}
			break;
		}
		case "Delete": {
			const lhsDetach = lhs as Detach;
			if ((lhsDetach.id as number) + lhsDetach.count === rhs.id) {
				lhsDetach.count += rhs.count;
				return true;
			}
			break;
		}
		case "MoveOut":
		case "ReturnFrom": {
			const lhsMoveOut = lhs as MoveOut<T> | ReturnFrom<T>;
			if ((lhsMoveOut.id as number) + lhsMoveOut.count === rhs.id) {
				lhsMoveOut.count += rhs.count;
				return true;
			}
			break;
		}
		case "Revive": {
			const lhsRevive = lhs as Revive;
			if (
				lhsRevive.inverseOf === rhs.inverseOf &&
				areMergeableChangeAtoms(lhsRevive.transientDetach, lhs.count, rhs.transientDetach)
			) {
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
	private nodes: Map<number, CellId> = new Map();
	private readonly equivalences: { old: CellId; new: CellId }[] = [];

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
			if (markEmptiesCells(mark)) {
				assert(isDetachMark(mark), 0x70d /* Only detach marks should empty cells */);
				const newNodes: Map<number, CellId> = new Map();
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
									revision:
										change.rollbackOf ??
										mark.revision ??
										change.revision ??
										fail("Unable to track detached nodes"),
									localId: brand((mark.id as number) + (k - index)),
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
				const newNodes: Map<number, CellId> = new Map();
				for (const [k, v] of this.nodes) {
					if (k >= index) {
						newNodes.set(k + inputLength, v);
					} else {
						newNodes.set(k, v);
					}
				}
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				for (let i = 0; i < mark.count; ++i) {
					newNodes.set(index + i, {
						revision: detachEvent.revision,
						localId: brand((detachEvent.localId as number) + i),
					});
				}
				this.nodes = newNodes;
			}
			if (!markEmptiesCells(mark)) {
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
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const revision = detachEvent.revision;
				for (let i = 0; i < mark.count; ++i) {
					const localId = brand<ChangesetLocalId>((detachEvent.localId as number) + i);
					const original: CellId = { revision, localId };
					const updated = this.getUpdatedDetach(original);
					for (const detached of this.nodes.values()) {
						if (
							updated.revision === detached.revision &&
							updated.localId === detached.localId
						) {
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
	public update<T>(change: TaggedChange<Changeset<T>>): TaggedChange<Changeset<T>> {
		const factory = new MarkListFactory<T>();
		for (const mark of change.change) {
			const cloned = cloneMark(mark);
			if (areInputCellsEmpty(cloned) && !isNewAttach(cloned)) {
				let remainder = cloned;
				while (remainder.count > 1) {
					const [head, tail] = splitMark(remainder, 1);
					this.updateMark(head);
					factory.push(head);
					remainder = tail;
				}
				this.updateMark(remainder);
				factory.push(remainder);
			} else {
				factory.push(cloned);
			}
		}

		return {
			...change,
			change: factory.list,
		};
	}

	private updateMark(mark: HasMarkFields & DetachedCellMark): void {
		const detachEvent = mark.cellId;
		const original = { revision: detachEvent.revision, localId: detachEvent.localId };
		const updated = this.getUpdatedDetach(original);
		if (updated.revision !== original.revision || updated.localId !== original.localId) {
			mark.cellId = { ...updated };
		}
	}

	private getUpdatedDetach(detach: CellId): CellId {
		let curr = detach;
		for (const eq of this.equivalences) {
			if (curr.revision === eq.old.revision && curr.localId === eq.old.localId) {
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
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const entry: CellId = {
					...detachEvent,
					localId: brand((detachEvent.localId as number) + i),
				};
				const key = `${entry.revision}|${entry.localId}`;
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
				const detachEvent = mark.cellId ?? fail("Unable to track detached nodes");
				const entry: CellId = {
					...detachEvent,
					localId: brand((detachEvent.localId as number) + i),
				};
				const key = `${entry.revision}|${entry.localId}`;
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
	mapSrc: Map<RevisionTag | undefined, RangeMap<T>>;
	mapDst: Map<RevisionTag | undefined, RangeMap<T>>;
	reset: () => void;
}

/**
 * @alpha
 */
export function newCrossFieldTable<T = unknown>(): CrossFieldTable<T> {
	const srcQueries: CrossFieldQuerySet = new Map();
	const dstQueries: CrossFieldQuerySet = new Map();
	const mapSrc: Map<RevisionTag | undefined, RangeMap<T>> = new Map();
	const mapDst: Map<RevisionTag | undefined, RangeMap<T>> = new Map();

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
			count: number,
			addDependency: boolean,
		) => {
			if (addDependency) {
				addCrossFieldQuery(getQueries(target), revision, id, count);
			}
			return getFirstFromRangeMap(getMap(target).get(revision) ?? [], id, count);
		},
		set: (
			target: CrossFieldTarget,
			revision: RevisionTag | undefined,
			id: MoveId,
			count: number,
			value: T,
			invalidateDependents: boolean,
		) => {
			if (
				invalidateDependents &&
				getFirstFromRangeMap(getQueries(target).get(revision) ?? [], id, count) !==
					undefined
			) {
				table.isInvalidated = true;
			}
			setInCrossFieldMap(getMap(target), revision, id, count, value);
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
export function splitMark<T, TMark extends Mark<T>>(mark: TMark, length: number): [TMark, TMark] {
	const markLength = mark.count;
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail("Unable to split mark due to lengths");
	}
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			const mark1 = { ...mark, count: length };
			const mark2 = { ...mark, count: remainder };
			if (mark.cellId !== undefined) {
				(mark2 as NoopMark<T>).cellId = splitDetachEvent(mark.cellId, length);
			}
			return [mark1, mark2];
		}
		case "Insert": {
			const mark1: TMark = { ...mark, content: mark.content.slice(0, length), count: length };
			const mark2: TMark = {
				...mark,
				content: mark.content.slice(length),
				count: remainder,
			};
			if (mark2.cellId !== undefined) {
				mark2.cellId = splitDetachEvent(mark2.cellId, length);
			}
			if (mark.transientDetach !== undefined) {
				(mark2 as Transient).transientDetach = {
					revision: mark.transientDetach.revision,
					localId: brand((mark.transientDetach.localId as number) + length),
				};
			}
			return [mark1, mark2];
		}
		case "MoveIn":
		case "ReturnTo": {
			const mark1: TMark = { ...mark, count: length };
			const mark2: TMark = { ...mark, id: (mark.id as number) + length, count: remainder };
			if (mark.cellId !== undefined) {
				(mark2 as ReturnTo).cellId = splitDetachEvent(mark.cellId, length);
			}
			return [mark1, mark2];
		}
		case "Revive": {
			const mark1: TMark = { ...mark, content: mark.content.slice(0, length), count: length };
			const mark2: TMark = {
				...mark,
				content: mark.content.slice(length),
				count: remainder,
			};

			if (mark.cellId !== undefined) {
				(mark2 as Revive).cellId = splitDetachEvent(mark.cellId, length);
			}
			if (mark.transientDetach !== undefined) {
				(mark2 as Transient).transientDetach = {
					revision: mark.transientDetach.revision,
					localId: brand((mark.transientDetach.localId as number) + length),
				};
			}
			return [mark1, mark2];
		}
		case "Delete": {
			const mark1 = { ...mark, count: length };
			const id2: ChangesetLocalId = brand((mark.id as number) + length);
			const mark2 =
				mark.cellId !== undefined
					? {
							...mark,
							id: id2,
							count: remainder,
							cellId: splitDetachEvent(mark.cellId, length),
					  }
					: {
							...mark,
							id: id2,
							count: remainder,
					  };

			return [mark1, mark2];
		}
		case "MoveOut":
		case "ReturnFrom": {
			// TODO: Handle detach index for ReturnFrom
			const mark1 = { ...mark, count: length };
			const mark2 = {
				...mark,
				id: (mark.id as number) + length,
				count: remainder,
			};
			if (mark.cellId !== undefined) {
				(mark2 as Detach).cellId = splitDetachEvent(mark.cellId, length);
			}
			return [mark1, mark2];
		}
		case "Placeholder":
			fail("TODO");
		default:
			unreachableCase(type);
	}
}

function splitDetachEvent(detachEvent: CellId, length: number): CellId {
	return { ...detachEvent, localId: brand((detachEvent.localId as number) + length) };
}

export function compareLineages(
	lineage1: readonly LineageEvent[] | undefined,
	lineage2: readonly LineageEvent[] | undefined,
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

export function withNodeChange<TNodeChange>(
	mark: Mark<TNodeChange>,
	changes: TNodeChange | undefined,
): Mark<TNodeChange> {
	const newMark = { ...mark };
	if (changes !== undefined) {
		assert(
			mark.type !== "MoveIn" && mark.type !== "ReturnTo",
			0x6a7 /* Cannot have a node change on a MoveIn or ReturnTo mark */,
		);
		newMark.changes = changes;
	} else {
		delete newMark.changes;
	}
	return newMark;
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

	const cloned = cloneMark(mark);
	(cloned as Exclude<Mark<unknown>, NoopMark<unknown>>).revision = revision;
	return cloned;
}

export function getMarkMoveId(mark: Mark<unknown>): MoveId | undefined {
	if (isMoveMark(mark)) {
		return mark.id;
	}

	return undefined;
}
