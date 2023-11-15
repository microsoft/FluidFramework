/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionTag,
	TaggedChange,
	areEqualChangeAtomIds,
} from "../../core";
import { brand, fail, getFromRangeMap, getOrAddEmptyToMap, RangeMap } from "../../util";
import {
	addCrossFieldQuery,
	CrossFieldManager,
	CrossFieldQuerySet,
	CrossFieldTarget,
	getIntention,
	RevisionMetadataSource,
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
	MoveOut,
	ReturnFrom,
	NoopMark,
	Changeset,
	MoveId,
	Delete,
	NoopMarkType,
	HasMarkFields,
	CellId,
	CellMark,
	TransientEffect,
	MarkEffect,
	InverseAttachFields,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { isMoveDestination, isMoveMark, MoveEffectTable } from "./moveEffectTable";
import {
	EmptyInputCellMark,
	DetachedCellMark,
	MoveDestination,
	MoveMarkEffect,
} from "./helperTypes";

export function isEmpty<T>(change: Changeset<T>): boolean {
	return change.length === 0;
}

export function isNewAttach(mark: Mark<unknown>, revision?: RevisionTag): boolean {
	return isNewAttachEffect(mark, mark.cellId, revision);
}

export function isNewAttachEffect(
	effect: MarkEffect,
	cellId: CellId | undefined,
	revision?: RevisionTag,
): boolean {
	return (
		(isAttach(effect) &&
			cellId !== undefined &&
			(effect.revision ?? revision) === (cellId.revision ?? revision)) ||
		(isTransientEffect(effect) && isNewAttachEffect(effect.attach, cellId, revision))
	);
}

export function isInsert(mark: MarkEffect): mark is Insert {
	return mark.type === "Insert";
}

export function isAttach(effect: MarkEffect): effect is Attach {
	return effect.type === "Insert" || effect.type === "MoveIn";
}

export function isReattach(mark: Mark<unknown>): boolean {
	return isReattachEffect(mark, mark.cellId);
}

export function isReattachEffect(effect: MarkEffect, cellId: CellId | undefined): boolean {
	return isAttach(effect) && !isNewAttachEffect(effect, cellId);
}

export function isActiveReattach<T>(
	mark: Mark<T>,
): mark is CellMark<Insert, T> & { conflictsWith?: undefined } {
	// No need to check Reattach.lastDeletedBy because it can only be set if the mark is conflicted
	return isAttach(mark) && isReattachEffect(mark, mark.cellId) && mark.cellId !== undefined;
}

export function isReturnMuted(mark: CellMark<MoveIn, unknown>): boolean {
	return mark.isSrcConflicted ?? mark.cellId === undefined;
}

export function areEqualCellIds(a: CellId | undefined, b: CellId | undefined): boolean {
	if (a === undefined || b === undefined) {
		return a === b;
	}
	return areEqualChangeAtomIds(a, b) && areSameLineage(a.lineage, b.lineage);
}

export function getInputCellId(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
	metadata: RevisionMetadataSource | undefined,
): CellId | undefined {
	const cellId = mark.cellId;
	if (cellId === undefined) {
		return undefined;
	}

	if (cellId.revision !== undefined) {
		return cellId;
	}

	let markRevision: RevisionTag | undefined;
	if (isTransientEffect(mark)) {
		markRevision = mark.attach.revision;
	} else {
		assert(isAttach(mark), "Only attach marks should have undefined revision in cell ID");
		markRevision = mark.revision;
	}

	return {
		...cellId,
		revision: getIntentionIfMetadataProvided(markRevision ?? revision, metadata),
	};
}

export function getOutputCellId(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
	metadata: RevisionMetadataSource | undefined,
): CellId | undefined {
	if (markEmptiesCells(mark)) {
		assert(isDetach(mark), 0x750 /* Only detaches can empty cells */);
		return getDetachOutputId(mark, revision, metadata);
	} else if (markFillsCells(mark)) {
		return undefined;
	} else if (isTransientEffect(mark)) {
		return getDetachOutputId(mark.detach, revision, metadata);
	}

	return getInputCellId(mark, revision, metadata);
}

export function getDetachOutputId(
	mark: Detach,
	revision: RevisionTag | undefined,
	metadata: RevisionMetadataSource | undefined,
): ChangeAtomId {
	return (
		getOverrideDetachId(mark) ?? {
			revision: getIntentionIfMetadataProvided(mark.revision ?? revision, metadata),
			localId: mark.id,
		}
	);
}

function getIntentionIfMetadataProvided(
	revision: RevisionTag | undefined,
	metadata: RevisionMetadataSource | undefined,
): RevisionTag | undefined {
	return metadata === undefined ? revision : getIntention(revision, metadata);
}

function getOverrideDetachId(mark: Detach): ChangeAtomId | undefined {
	return mark.type !== "MoveOut" && mark.detachIdOverride !== undefined
		? mark.detachIdOverride
		: undefined;
}

export function cloneMark<TMark extends Mark<TNodeChange>, TNodeChange>(mark: TMark): TMark {
	const clone: TMark = { ...cloneMarkEffect(mark), count: mark.count };

	if (mark.cellId !== undefined) {
		clone.cellId = cloneCellId(mark.cellId);
	}
	return clone;
}

export function cloneMarkEffect<TEffect extends MarkEffect>(effect: TEffect): TEffect {
	const clone = { ...effect };
	if (clone.type === "Transient") {
		clone.attach = cloneMarkEffect(clone.attach);
		clone.detach = cloneMarkEffect(clone.detach);
	}

	if (clone.type === "Insert" && clone.content !== undefined) {
		clone.content = [...clone.content];
	}
	return clone;
}

export function cloneCellId(id: CellId): CellId {
	const cloned = { ...id };
	if (cloned.lineage !== undefined) {
		cloned.lineage = [...cloned.lineage];
	}
	return cloned;
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

export function isTransientEffect(effect: MarkEffect): effect is TransientEffect {
	return effect.type === "Transient";
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
		case "Delete":
		case "MoveOut":
		case "Transient":
			return true;
		case "ReturnFrom":
			return mark.cellId !== undefined || !mark.isDstConflicted;
		case "MoveIn":
		case "Insert":
			return mark.cellId !== undefined && isMuted(mark);
		default:
			unreachableCase(type);
	}
}

export function isMuted(mark: Mark<unknown>): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
		case "Placeholder":
			return false;
		case "Delete":
		case "MoveOut":
			return mark.cellId !== undefined;
		case "ReturnFrom":
			return mark.cellId !== undefined || (mark.isDstConflicted ?? false);
		case "MoveIn":
			return (mark.isSrcConflicted ?? false) || mark.cellId === undefined;
		case "Insert":
			return mark.cellId === undefined;
		case "Transient":
			return (
				mark.cellId === undefined ||
				(isMoveDestination(mark.attach) && (mark.attach.isSrcConflicted ?? false))
			);
		default:
			unreachableCase(type);
	}
}

export function isNoopMark<T>(mark: Mark<T>): mark is CellMark<NoopMark, T> {
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

export function isDetach(mark: MarkEffect | undefined): mark is Detach {
	const type = mark?.type;
	return type === "Delete" || type === "MoveOut" || type === "ReturnFrom";
}

export function isDeleteMark<TNodeChange>(
	mark: Mark<TNodeChange> | undefined,
): mark is CellMark<Delete, TNodeChange> {
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

	return lhs.revision === rhs.revision && areAdjacentIdRanges(lhs.localId, lhsCount, rhs.localId);
}

function areAdjacentIdRanges(
	firstStart: ChangesetLocalId,
	firstLength: number,
	secondStart: ChangesetLocalId,
): boolean {
	return (firstStart as number) + firstLength === secondStart;
}

function haveMergeableIdOverrides(
	lhs: InverseAttachFields,
	lhsCount: number,
	rhs: InverseAttachFields,
): boolean {
	return areMergeableChangeAtoms(lhs.detachIdOverride, lhsCount, rhs.detachIdOverride);
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
export function tryMergeMarks<T>(lhs: Mark<T>, rhs: Readonly<Mark<T>>): Mark<T> | undefined {
	if (rhs.type !== lhs.type) {
		return undefined;
	}

	if (!areMergeableCellIds(lhs.cellId, lhs.count, rhs.cellId)) {
		return undefined;
	}

	if (rhs.changes !== undefined || lhs.changes !== undefined) {
		return undefined;
	}

	const mergedEffect = tryMergeEffects(lhs, rhs, lhs.count);
	if (mergedEffect === undefined) {
		return undefined;
	}

	return { ...lhs, ...mergedEffect, count: lhs.count + rhs.count };
}

function tryMergeEffects(
	lhs: MarkEffect,
	rhs: MarkEffect,
	lhsCount: number,
): MarkEffect | undefined {
	if (lhs.type !== rhs.type) {
		return undefined;
	}

	if (rhs.type === NoopMarkType) {
		return lhs;
	}

	if (rhs.type === "Transient") {
		const lhsTransient = lhs as TransientEffect;
		const attach = tryMergeEffects(lhsTransient.attach, rhs.attach, lhsCount);
		const detach = tryMergeEffects(lhsTransient.detach, rhs.detach, lhsCount);
		if (attach === undefined || detach === undefined) {
			return undefined;
		}

		assert(
			isAttach(attach) && isDetach(detach),
			"Merged marks should be same type as input marks",
		);
		return { ...lhsTransient, attach, detach };
	}

	if ((lhs as HasRevisionTag).revision !== rhs.revision) {
		return undefined;
	}

	if (
		isDetach(lhs) &&
		isDetach(rhs) &&
		!areMergeableCellIds(getOverrideDetachId(lhs), lhsCount, getOverrideDetachId(rhs))
	) {
		return undefined;
	}

	const type = rhs.type;
	switch (type) {
		case "MoveIn": {
			const lhsMoveIn = lhs as MoveIn;
			if (
				lhsMoveIn.isSrcConflicted === rhs.isSrcConflicted &&
				(lhsMoveIn.id as number) + lhsCount === rhs.id &&
				areMergeableChangeAtoms(lhsMoveIn.finalEndpoint, lhsCount, rhs.finalEndpoint)
			) {
				return lhsMoveIn;
			}
			break;
		}
		case "Delete": {
			const lhsDetach = lhs as Delete;
			if (
				(lhsDetach.id as number) + lhsCount === rhs.id &&
				haveMergeableIdOverrides(lhsDetach, lhsCount, rhs)
			) {
				return lhsDetach;
			}
			break;
		}
		case "MoveOut":
		case "ReturnFrom": {
			const lhsMoveOut = lhs as MoveOut | ReturnFrom;
			if (
				(lhsMoveOut.id as number) + lhsCount === rhs.id &&
				haveMergeableIdOverrides(
					lhsMoveOut as Partial<ReturnFrom>,
					lhsCount,
					rhs as Partial<ReturnFrom>,
				) &&
				areMergeableChangeAtoms(lhsMoveOut.finalEndpoint, lhsCount, rhs.finalEndpoint)
			) {
				return lhsMoveOut;
			}
			break;
		}
		case "Insert": {
			const lhsInsert = lhs as Insert;
			if (rhs.content === undefined) {
				assert(lhsInsert.content === undefined, "Insert content type mismatch");
				return lhsInsert;
			} else {
				assert(lhsInsert.content !== undefined, "Insert content type mismatch");
				return { ...lhsInsert, content: [...lhsInsert.content, ...rhs.content] };
			}
		}
		case "Placeholder":
			break;
		default:
			unreachableCase(type);
	}

	return undefined;
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
				assert(isDetach(mark), 0x70d /* Only detach marks should empty cells */);
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
			return getFromRangeMap(getMap(target).get(revision) ?? [], id, count);
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
				getFromRangeMap(getQueries(target).get(revision) ?? [], id, count) !== undefined
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

	const [effect1, effect2] = splitMarkEffect(mark, length);
	const mark1 = { ...mark, ...effect1, count: length };
	const mark2 = { ...mark, ...effect2, count: remainder };
	if (mark2.cellId !== undefined) {
		mark2.cellId = splitDetachEvent(mark2.cellId, length);
	}

	return [mark1, mark2];
}

function splitMarkEffect<TEffect extends MarkEffect>(
	effect: TEffect,
	length: number,
): [TEffect, TEffect] {
	const type = effect.type;
	switch (type) {
		case NoopMarkType:
			return [effect, effect];
		case "Insert": {
			const effect1: TEffect = {
				...effect,
			};
			const effect2: TEffect = {
				...effect,
			};

			if (effect.content !== undefined) {
				(effect1 as Insert).content = effect.content.slice(0, length);
				(effect2 as Insert).content = effect.content.slice(length);
			}
			return [effect1, effect2];
		}
		case "MoveIn": {
			const effect2: TEffect = { ...effect, id: (effect.id as number) + length };
			const move2 = effect2 as MoveDestination;
			if (move2.finalEndpoint !== undefined) {
				move2.finalEndpoint = splitDetachEvent(move2.finalEndpoint, length);
			}
			return [effect, effect2];
		}
		case "Delete": {
			const effect1 = { ...effect };
			const id2: ChangesetLocalId = brand((effect.id as number) + length);
			const effect2 = { ...effect, id: id2 };
			const effect2Delete = effect2 as Delete;
			if (effect2Delete.detachIdOverride !== undefined) {
				effect2Delete.detachIdOverride = splitDetachEvent(
					effect2Delete.detachIdOverride,
					length,
				);
			}
			return [effect1, effect2];
		}
		case "MoveOut": {
			const effect2: TEffect = { ...effect, id: (effect.id as number) + length };
			const move2 = effect2 as MoveOut;
			if (move2.finalEndpoint !== undefined) {
				move2.finalEndpoint = splitDetachEvent(move2.finalEndpoint, length);
			}

			return [effect, effect2];
		}
		case "ReturnFrom": {
			const effect2 = {
				...effect,
				id: (effect.id as number) + length,
			};

			const return2 = effect2 as ReturnFrom;

			if (return2.detachIdOverride !== undefined) {
				return2.detachIdOverride = splitDetachEvent(return2.detachIdOverride, length);
			}

			if (return2.finalEndpoint !== undefined) {
				return2.finalEndpoint = splitDetachEvent(return2.finalEndpoint, length);
			}
			return [effect, effect2];
		}
		case "Transient": {
			const [attach1, attach2] = splitMarkEffect(effect.attach, length);
			const [detach1, detach2] = splitMarkEffect(effect.detach, length);
			const effect1 = {
				...effect,
				attach: attach1,
				detach: detach1,
			};

			const effect2 = {
				...effect,
				attach: attach2,
				detach: detach2,
			};

			return [effect1, effect2];
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

// TODO: Refactor MarkEffect into a field of CellMark so this function isn't necessary.
export function extractMarkEffect<TEffect extends MarkEffect>(
	mark: CellMark<TEffect, unknown>,
): TEffect {
	const { cellId: _cellId, count: _count, changes: _changes, ...effect } = mark;
	return effect as unknown as TEffect;
}

export function withNodeChange<TNodeChange>(
	mark: Mark<TNodeChange>,
	changes: TNodeChange | undefined,
): Mark<TNodeChange> {
	const newMark = { ...mark };
	if (changes !== undefined) {
		assert(
			mark.type !== "MoveIn",
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
	const cloned = cloneMark(mark);
	addRevision(cloned, revision);
	return cloned;
}

export function addRevision(effect: MarkEffect, revision: RevisionTag | undefined): void {
	if (revision === undefined) {
		return;
	}

	if (effect.type === NoopMarkType) {
		return;
	}

	if (effect.type === "Transient") {
		addRevision(effect.attach, revision);
		addRevision(effect.detach, revision);
		return;
	}

	assert(
		effect.revision === undefined || effect.revision === revision,
		"Should not overwrite mark revision",
	);
	effect.revision = revision;
}

export function getMarkMoveId(mark: Mark<unknown>): MoveId | undefined {
	if (isMoveMark(mark)) {
		return mark.id;
	}

	return undefined;
}

export function getEndpoint(
	effect: MoveMarkEffect,
	revision: RevisionTag | undefined,
): ChangeAtomId {
	const effectRevision = effect.revision ?? revision;
	return effect.finalEndpoint !== undefined
		? {
				...effect.finalEndpoint,
				revision: effect.finalEndpoint.revision ?? effectRevision,
		  }
		: { revision: effectRevision, localId: effect.id };
}
