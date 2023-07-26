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
	Detach,
	HasChanges,
	HasRevisionTag,
	Insert,
	LineageEvent,
	Mark,
	Modify,
	MoveIn,
	ReturnTo,
	Changeset,
	MoveId,
	Revive,
	NoopMarkType,
	Transient,
	CellId,
	HasReattachFields,
	Effect,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { MoveEffectTable } from "./moveEffectTable";
import {
	AttachMark,
	DeleteMark,
	DetachMark,
	DetachedCellMark,
	EffectMark,
	EmptyInputCellMark,
	ExistingCellMark,
	GenerateMark,
	InsertMark,
	ModifyMark,
	MoveInMark,
	MoveMark,
	MoveOutMark,
	MovePlaceholderMark,
	NewAttachMark,
	NoopMark,
	ReattachMark,
	ReturnFromMark,
	ReturnToMark,
	ReviveMark,
	TransientGenerateMark,
} from "./helperTypes";

export function isEmpty<T>(change: Changeset<T>): boolean {
	return change.length === 0;
}

export function getEffect<TEffect extends Effect<unknown>>(mark: EffectMark<TEffect>): TEffect {
	return mark.effect[0];
}

export function tryGetEffect<TNodeChange>(
	mark: Mark<TNodeChange>,
): Effect<TNodeChange> | undefined {
	return mark.effect === undefined ? undefined : mark.effect[0];
}

export function isModify<TNodeChange>(mark: Mark<TNodeChange>): mark is ModifyMark<TNodeChange> {
	return tryGetEffect(mark)?.type === "Modify";
}

export function isReturnTo(mark: Mark<unknown>): mark is ReturnToMark {
	return tryGetEffect(mark)?.type === "ReturnTo";
}

export function isReturnFrom<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is ReturnFromMark<TNodeChange> {
	return tryGetEffect(mark)?.type === "ReturnFrom";
}

export function isPlaceholder<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is MovePlaceholderMark<TNodeChange> {
	return tryGetEffect(mark)?.type === "Placeholder";
}

export function isMoveOut<TNodeChange>(mark: Mark<TNodeChange>): mark is MoveOutMark<TNodeChange> {
	return tryGetEffect(mark)?.type === "MoveOut";
}

export function isMoveIn(mark: Mark<unknown>): mark is MoveInMark {
	return tryGetEffect(mark)?.type === "MoveIn";
}

export function isInsert<TNodeChange>(mark: Mark<TNodeChange>): mark is InsertMark<TNodeChange> {
	return tryGetEffect(mark)?.type === "Insert";
}

export function isNewAttach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is NewAttachMark<TNodeChange> {
	const type = tryGetEffect(mark)?.type;
	return type === "Insert" || type === "MoveIn";
}

export function isGenerate<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is GenerateMark<TNodeChange> {
	const type = tryGetEffect(mark)?.type;
	return type === "Insert" || type === "Revive";
}

export function isMoveMark<T>(mark: Mark<T>): mark is MoveMark<T> {
	switch (tryGetEffect(mark)?.type) {
		case "MoveIn":
		case "MoveOut":
		case "ReturnFrom":
		case "ReturnTo":
			return true;
		default:
			return false;
	}
}

export function isAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is AttachMark<TNodeChange> {
	return isNewAttach(mark) || isReattach(mark);
}

export function isReattach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is ReattachMark<TNodeChange> {
	const type = tryGetEffect(mark)?.type;
	return type === "Revive" || type === "ReturnTo";
}

export function isActiveReattach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is ReattachMark<TNodeChange> & { conflictsWith?: undefined } {
	// No need to check Reattach.lastDeletedBy because it can only be set if the mark is conflicted
	return isReattach(mark) && !isConflictedReattach(mark);
}

// TODO: Name is misleading
export function isConflictedReattach<TNodeChange>(
	mark: Mark<TNodeChange>,
): mark is ReattachMark<TNodeChange> {
	return isReattach(mark) && isReattachConflicted(mark);
}

// TODO: Name is misleading
export function isReattachConflicted(mark: ReattachMark<unknown>): boolean {
	const effect = getEffect(mark);
	return (
		mark.cellId === undefined ||
		(effect.inverseOf !== undefined && effect.inverseOf !== mark.cellId.revision)
	);
}

export function isReturnMuted(mark: ReturnToMark): boolean {
	return getEffect(mark).isSrcConflicted ?? isReattachConflicted(mark);
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
	if (mark.cellId !== undefined && mark.cellId.revision === undefined) {
		return { ...mark.cellId, revision };
	}
	return mark.cellId;
}

export function cloneMark<TMark extends Mark<TNodeChange>, TNodeChange>(mark: TMark): TMark {
	const clone = { ...mark };
	if (clone.effect !== undefined) {
		const effect = { ...clone.effect[0] };
		clone.effect = [effect];
		if (effect.type === "Insert" || effect.type === "Revive") {
			effect.content = [...effect.content];
		}
		if (clone.cellId !== undefined) {
			clone.cellId = { ...clone.cellId };
			if (clone.cellId.lineage !== undefined) {
				clone.cellId.lineage = [...clone.cellId.lineage];
			}
		}
	}
	return clone;
}

function haveEqualReattachFields(
	lhs: Readonly<HasReattachFields>,
	rhs: Readonly<HasReattachFields>,
): boolean {
	return lhs.inverseOf === rhs.inverseOf;
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
	return areOutputCellsEmpty(mark) ? 0 : getMarkLength(mark);
}

export function getRevision(mark: Mark<unknown>): RevisionTag | undefined {
	const effect = tryGetEffect(mark);
	if (effect === undefined) {
		return undefined;
	}
	return effect?.type === "Modify" ? undefined : effect.revision;
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

export function markIsTransient<T>(mark: Mark<T>): mark is TransientGenerateMark<T> {
	return isGenerate(mark) && mark.effect[0].transientDetach !== undefined;
}

export function isExistingCellMark<T>(mark: Mark<T>): mark is ExistingCellMark<T> {
	const type = tryGetEffect(mark)?.type;
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

	return mark.cellId !== undefined;
}

export function areOutputCellsEmpty(mark: Mark<unknown>): boolean {
	const effect = tryGetEffect(mark);
	if (effect === undefined) {
		return false;
	}
	const type = effect.type;
	switch (type) {
		case NoopMarkType:
			return false;
		case "Insert":
			return effect.transientDetach !== undefined;
		case "MoveIn":
			return effect.isSrcConflicted ?? false;
		case "Delete":
		case "MoveOut":
			return true;
		case "Modify":
		case "Placeholder":
			return mark.cellId !== undefined;
		case "ReturnFrom":
			return mark.cellId !== undefined || !effect.isDstConflicted;
		case "ReturnTo":
			return (
				mark.cellId !== undefined &&
				((effect.isSrcConflicted ?? false) || isReattachConflicted(mark as ReturnToMark))
			);
		case "Revive":
			return (
				(mark.cellId !== undefined && isReattachConflicted(mark as ReviveMark<unknown>)) ||
				effect.transientDetach !== undefined
			);
		default:
			unreachableCase(type);
	}
}

export function getMarkLength(mark: Mark<unknown>): number {
	return mark.count;
}

export function isNoop(mark: Mark<unknown>): mark is NoopMark {
	return tryGetEffect(mark) === undefined;
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
): mark is DetachMark<TNodeChange> {
	const type = mark === undefined ? undefined : tryGetEffect(mark)?.type;
	return type === "Delete" || type === "MoveOut" || type === "ReturnFrom";
}

export function isDeleteMark<TNodeChange>(
	mark: Mark<TNodeChange> | undefined,
): mark is DeleteMark<TNodeChange> {
	const type = mark === undefined ? undefined : tryGetEffect(mark)?.type;
	return type === "Delete";
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
	if (lhs === undefined || rhs === undefined) {
		return lhs === undefined && rhs === undefined;
	}

	return (
		lhs.revision === rhs.revision &&
		(lhs.localId as number) + lhsCount === rhs.localId &&
		areSameLineage(lhs.lineage, rhs.lineage)
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
	const lhsEffect = tryGetEffect(lhs);
	const rhsEffect = tryGetEffect(rhs);
	if (lhsEffect?.type !== rhsEffect?.type) {
		return false;
	}
	if (!areMergeableCellIds(lhs.cellId, lhs.count, rhs.cellId)) {
		return false;
	}

	if (lhsEffect === undefined || rhsEffect === undefined) {
		if (lhsEffect === undefined && rhsEffect === undefined) {
			lhs.count += rhs.count;
			return true;
		}
		return false;
	}

	const type = rhsEffect.type;
	if (type !== "Modify" && rhsEffect.revision !== (lhsEffect as HasRevisionTag).revision) {
		return false;
	}

	if (
		(type !== "MoveIn" && type !== "ReturnTo" && rhsEffect.changes !== undefined) ||
		(lhs as Modify | HasChanges).changes !== undefined
	) {
		return false;
	}

	if (isExistingCellMark(lhs)) {
		assert(isExistingCellMark(rhs), 0x6a6 /* Should be existing cell mark */);
		if (lhs.cellId?.revision !== rhs.cellId?.revision) {
			return false;
		}

		if (
			lhs.cellId !== undefined &&
			(lhs.cellId.localId as number) + lhs.count !== rhs.cellId?.localId
		) {
			return false;
		}
	}

	switch (type) {
		case "Insert": {
			const lhsInsert = lhsEffect as Insert;
			if (
				areMergeableChangeAtoms(
					lhsInsert.transientDetach,
					lhs.count,
					rhsEffect.transientDetach,
				)
			) {
				lhsInsert.content.push(...rhsEffect.content);
				return true;
			}
			break;
		}
		case "MoveIn": {
			const lhsMoveIn = lhsEffect as MoveIn;
			if (
				lhsMoveIn.isSrcConflicted === rhsEffect.isSrcConflicted &&
				(lhsMoveIn.id as number) + lhs.count === rhsEffect.id
			) {
				return true;
			}
			break;
		}
		case "ReturnTo": {
			const lhsReturnTo = lhsEffect as ReturnTo;
			if (
				haveEqualReattachFields(lhsReturnTo, rhsEffect) &&
				lhsReturnTo.isSrcConflicted === rhsEffect.isSrcConflicted &&
				(lhsReturnTo.id as number) + lhs.count === rhsEffect.id
			) {
				return true;
			}
		}
		case "MoveOut":
		case "ReturnFrom":
		case "Delete": {
			const lhsDetach = lhsEffect as Detach;
			if ((lhsDetach.id as number) + lhs.count === rhsEffect.id) {
				return true;
			}
			break;
		}
		case "Revive": {
			const lhsRevive = lhsEffect as Revive;
			if (
				lhsRevive.inverseOf === rhsEffect.inverseOf &&
				areMergeableChangeAtoms(
					lhsRevive.transientDetach,
					getMarkLength(lhs),
					rhsEffect.transientDetach,
				)
			) {
				lhsRevive.content.push(...rhsEffect.content);
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
										mark.effect[0].revision ??
										change.revision ??
										fail("Unable to track detached nodes"),
									localId: brand((mark.effect[0].id as number) + (k - index)),
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
				while (getMarkLength(remainder) > 1) {
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

	private updateMark(mark: Mark<unknown> & DetachedCellMark): void {
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
	const markLength = getMarkLength(mark);
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail("Unable to split mark due to lengths");
	}
	const effect = tryGetEffect(mark);
	if (effect === undefined) {
		assert(mark.cellId === undefined, "Unexpected CellId on Noop mark");
		return [{ count: length }, { count: remainder }] as [TMark, TMark];
	}
	const [effect1, effect2] = splitEffect(effect, length);
	const mark1: Mark<T> = { count: length, effect: [effect1] };
	const mark2: Mark<T> = { count: remainder, effect: [effect2] };
	if (mark.cellId !== undefined) {
		mark1.cellId = mark.cellId;
		mark2.cellId = higherCellId(mark.cellId, length);
	}
	return [mark1, mark2] as [TMark, TMark];
}
export function splitEffect<T, TEffect extends Effect<T>>(
	effect: TEffect,
	length: number,
): [TEffect, TEffect] {
	const type = effect.type;
	switch (type) {
		case "Modify":
			fail("Unable to split Modify mark of length 1");
		case "Insert": {
			const effect1: TEffect = { ...effect, content: effect.content.slice(0, length) };
			const effect2: TEffect = {
				...effect,
				content: effect.content.slice(length),
			};
			if (effect.transientDetach !== undefined) {
				(effect2 as Transient).transientDetach = higherCellId(
					effect.transientDetach,
					length,
				);
			}
			return [effect1, effect2];
		}
		case "MoveOut":
		case "ReturnFrom":
		case "Delete":
		case "MoveIn":
		case "ReturnTo": {
			const effect1: TEffect = { ...effect };
			const effect2: TEffect = {
				...effect,
				id: (effect.id as number) + length,
			};
			return [effect1, effect2];
		}
		case "Revive": {
			const effect1: TEffect = { ...effect, content: effect.content.slice(0, length) };
			const effect2: TEffect = {
				...effect,
				content: effect.content.slice(length),
			};

			if (effect.transientDetach !== undefined) {
				(effect2 as Transient).transientDetach = higherCellId(
					effect.transientDetach,
					length,
				);
			}
			return [effect1, effect2];
		}
		case "Placeholder":
			fail("TODO");
		default:
			unreachableCase(type);
	}
}

function higherCellId(cellId: CellId, increment: number): CellId {
	return { ...cellId, localId: brand((cellId.localId as number) + increment) };
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

export function getNodeChange<TNodeChange>(mark: Mark<TNodeChange>): TNodeChange | undefined {
	const effect = tryGetEffect(mark);
	if (effect === undefined) {
		return undefined;
	}
	const type = effect?.type;
	switch (type) {
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
			return effect.changes;
		default:
			unreachableCase(type);
	}
}

export function withNodeChange<TNodeChange>(
	mark: Mark<TNodeChange>,
	changes: TNodeChange | undefined,
): Mark<TNodeChange> {
	const newMark = { ...mark };
	if (changes === undefined) {
		const effect = tryGetEffect(newMark);
		if (effect === undefined || effect.type === "Modify") {
			delete newMark.effect;
			return newMark;
		}
		if (effect.type !== "MoveIn" && effect.type !== "ReturnTo") {
			const newEffect = { ...effect };
			delete newEffect.changes;
			return { ...newMark, effect: [newEffect] };
		}
	} else {
		assert(mark.count === 1, "Only length 1 marks can carry nested changes");
		const effect = tryGetEffect(mark);
		if (effect === undefined) {
			return { ...mark, effect: [{ type: "Modify", changes }] };
		}
		const type = effect.type;
		switch (type) {
			case "MoveIn":
			case "ReturnTo":
				assert(false, 0x6a7 /* Cannot have a node change on a MoveIn or ReturnTo mark */);
			case "Delete":
			case "Insert":
			case "Modify":
			case "MoveOut":
			case "ReturnFrom":
			case "Revive":
			case "Placeholder": {
				const newEffect = { ...effect, changes };
				newMark.effect = [newEffect];
				break;
			}
			default:
				unreachableCase(type);
		}
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

	if (isNoop(mark)) {
		return mark;
	}

	if (isModify(mark)) {
		return mark;
	}

	const cloned = cloneMark(mark);
	const effect = tryGetEffect(cloned);
	(effect as Exclude<Effect<unknown>, Modify<unknown>>).revision = revision;
	return cloned;
}

export function getMarkMoveId(mark: Mark<unknown>): MoveId | undefined {
	if (isMoveMark(mark)) {
		return mark.effect[0].id;
	}

	return undefined;
}
