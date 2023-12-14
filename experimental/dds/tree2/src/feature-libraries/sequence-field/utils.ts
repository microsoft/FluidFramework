/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionMetadataSource,
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
	NoopMark,
	Changeset,
	MoveId,
	Delete,
	NoopMarkType,
	HasMarkFields,
	CellId,
	CellMark,
	AttachAndDetach,
	MarkEffect,
	RedetachFields,
	IdRange,
} from "./types";
import { MarkListFactory } from "./markListFactory";
import { isMoveMark, MoveEffectTable } from "./moveEffectTable";
import {
	EmptyInputCellMark,
	DetachedCellMark,
	MoveMarkEffect,
	DetachOfRemovedNodes,
	CellRename,
	VestigialEndpoint,
	isVestigialEndpoint,
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
		(isAttachAndDetachEffect(effect) && isNewAttachEffect(effect.attach, cellId, revision))
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
	return isAttach(mark) && isReattachEffect(mark, mark.cellId) && mark.cellId !== undefined;
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
	if (isAttachAndDetachEffect(mark)) {
		markRevision = mark.attach.revision;
	} else if (!isNoopMark(mark)) {
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
	if (isDetach(mark)) {
		return getDetachOutputId(mark, revision, metadata);
	} else if (markFillsCells(mark)) {
		return undefined;
	} else if (isAttachAndDetachEffect(mark)) {
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
		mark.redetachId ?? {
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

/**
 * Preserves the semantics of the given `mark` but repackages it into a `DetachOfRemovedNodes` when possible.
 */
export function normalizeCellRename<TNodeChange>(
	mark: CellMark<AttachAndDetach, TNodeChange>,
	nodeChange?: TNodeChange,
): CellMark<AttachAndDetach | DetachOfRemovedNodes, TNodeChange> {
	assert(mark.cellId !== undefined, 0x823 /* AttachAndDetach marks should have a cell ID */);
	if (mark.attach.type !== "Insert" || isNewAttachEffect(mark.attach, mark.cellId)) {
		return withNodeChange(mark, nodeChange);
	}
	// Normalization: when the attach is a revive, we rely on the implicit reviving semantics of the
	// detach instead of using an explicit revive effect in an AttachAndDetach mark.
	return withNodeChange(
		{
			...mark.detach,
			count: mark.count,
			cellId: mark.cellId,
		},
		nodeChange ?? mark.changes,
	);
}

/**
 * Preserves the semantics of the given `mark` but repackages it into an `AttachAndDetach` mark if it is not already one.
 */
export function asAttachAndDetach<TNodeChange>(
	mark: CellMark<CellRename, TNodeChange>,
): CellMark<AttachAndDetach, TNodeChange> {
	if (mark.type === "AttachAndDetach") {
		return mark;
	}
	const { cellId, count, changes, revision, ...effect } = mark;
	const attachAndDetach: CellMark<AttachAndDetach | Detach, TNodeChange> = {
		type: "AttachAndDetach",
		count,
		cellId,
		attach: {
			type: "Insert",
			id: mark.id,
		},
		detach: effect,
	};
	if (changes !== undefined) {
		attachAndDetach.changes = changes;
	}
	if (revision !== undefined) {
		attachAndDetach.attach.revision = revision;
		attachAndDetach.detach.revision = revision;
	}
	return attachAndDetach;
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
	if (clone.type === "AttachAndDetach") {
		clone.attach = cloneMarkEffect(clone.attach);
		clone.detach = cloneMarkEffect(clone.detach);
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

export function isAttachAndDetachEffect(effect: MarkEffect): effect is AttachAndDetach {
	return effect.type === "AttachAndDetach";
}

export function isDetachOfRemovedNodes(
	mark: Mark<unknown>,
): mark is CellMark<DetachOfRemovedNodes, unknown> {
	return isDetach(mark) && mark.cellId !== undefined;
}

export function isImpactfulCellRename(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): mark is CellMark<CellRename, unknown> {
	return (
		(isAttachAndDetachEffect(mark) || isDetachOfRemovedNodes(mark)) &&
		isImpactful(mark, revision, revisionMetadata)
	);
}

export function areInputCellsEmpty<T>(mark: Mark<T>): mark is EmptyInputCellMark<T> {
	return mark.cellId !== undefined;
}

export function areOutputCellsEmpty(mark: Mark<unknown>): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return mark.cellId !== undefined;
		case "Delete":
		case "MoveOut":
		case "AttachAndDetach":
			return true;
		case "MoveIn":
		case "Insert":
			return false;
		default:
			unreachableCase(type);
	}
}

/**
 * Creates a mark that is equivalent to the given `mark` but with effects removed if those have no impact in the input
 * context of that mark.
 *
 * @param mark - The mark to settle. Never mutated.
 * @param revision - The revision associated with the mark.
 * @param revisionMetadata - Metadata source for the revision associated with the mark.
 * @returns either the original mark or a shallow clone of it with effects stripped out.
 */
export function settleMark<TChildChange>(
	mark: Mark<TChildChange>,
	revision: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): Mark<TChildChange> {
	if (isImpactful(mark, revision, revisionMetadata)) {
		return mark;
	}
	return omitMarkEffect(mark);
}

/**
 * @returns true, iff the given `mark` would have impact on the field when applied.
 * Ignores the impact of nested changes.
 * CellRename effects are considered impactful if they actually change the ID of the cells.
 */
export function isImpactful(
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
	revisionMetadata: RevisionMetadataSource,
): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return false;
		case "Delete": {
			const inputId = getInputCellId(mark, revision, revisionMetadata);
			if (inputId === undefined) {
				return true;
			}
			const outputId = getOutputCellId(mark, revision, revisionMetadata);
			assert(outputId !== undefined, 0x824 /* Delete marks must have an output cell ID */);
			return !areEqualChangeAtomIds(inputId, outputId);
		}
		case "AttachAndDetach":
		case "MoveOut":
			return true;
		case "MoveIn":
			// MoveIn marks always target an empty cell.
			assert(mark.cellId !== undefined, 0x825 /* MoveIn marks should target empty cells */);
			return true;
		case "Insert":
			// A Revive has no impact if the nodes are already in the document.
			return mark.cellId !== undefined;
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

export function compareCellsFromSameRevision(
	cell1: CellId,
	count1: number,
	cell2: CellId,
	count2: number,
): number | undefined {
	assert(cell1.revision === cell2.revision, 0x85b /* Expected cells to have the same revision */);
	if (areOverlappingIdRanges(cell1.localId, count1, cell2.localId, count2)) {
		return cell1.localId - cell2.localId;
	}

	// Both cells should have the same `adjacentCells`.
	const adjacentCells = cell1.adjacentCells;
	if (adjacentCells !== undefined) {
		return (
			getPositionAmongAdjacentCells(adjacentCells, cell1.localId) -
			getPositionAmongAdjacentCells(adjacentCells, cell2.localId)
		);
	}

	return undefined;
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

export function isDetach(mark: MarkEffect | undefined): mark is Detach {
	const type = mark?.type;
	return type === "Delete" || type === "MoveOut";
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
	lhs: RedetachFields,
	lhsCount: number,
	rhs: RedetachFields,
): boolean {
	return areMergeableChangeAtoms(lhs.redetachId, lhsCount, rhs.redetachId);
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
 * @returns `lhs` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `undefined` is returned, `lhs` is left untouched.
 */
export function tryMergeMarks<T>(
	lhs: Mark<T> & Partial<VestigialEndpoint>,
	rhs: Readonly<Mark<T> & Partial<VestigialEndpoint>>,
): (Mark<T> & Partial<VestigialEndpoint>) | undefined {
	if (rhs.type !== lhs.type) {
		return undefined;
	}

	if (!areMergeableCellIds(lhs.cellId, lhs.count, rhs.cellId)) {
		return undefined;
	}

	if (rhs.changes !== undefined || lhs.changes !== undefined) {
		return undefined;
	}

	if (isVestigialEndpoint(lhs)) {
		if (isVestigialEndpoint(rhs)) {
			if (!areMergeableChangeAtoms(lhs.vestigialEndpoint, lhs.count, rhs.vestigialEndpoint)) {
				return undefined;
			}
		} else {
			return undefined;
		}
	} else if (isVestigialEndpoint(rhs)) {
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

	if (rhs.type === "AttachAndDetach") {
		const lhsAttachAndDetach = lhs as AttachAndDetach;
		const attach = tryMergeEffects(lhsAttachAndDetach.attach, rhs.attach, lhsCount);
		const detach = tryMergeEffects(lhsAttachAndDetach.detach, rhs.detach, lhsCount);
		if (attach === undefined || detach === undefined) {
			return undefined;
		}

		assert(
			isAttach(attach) && isDetach(detach),
			0x826 /* Merged marks should be same type as input marks */,
		);
		return { ...lhsAttachAndDetach, attach, detach };
	}

	if ((lhs as HasRevisionTag).revision !== rhs.revision) {
		return undefined;
	}

	if (
		isDetach(lhs) &&
		isDetach(rhs) &&
		!areMergeableCellIds(lhs.redetachId, lhsCount, rhs.redetachId)
	) {
		return undefined;
	}

	const type = rhs.type;
	switch (type) {
		case "MoveIn": {
			const lhsMoveIn = lhs as MoveIn;
			if (
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
		case "MoveOut": {
			const lhsMoveOut = lhs as MoveOut;
			if (
				(lhsMoveOut.id as number) + lhsCount === rhs.id &&
				haveMergeableIdOverrides(lhsMoveOut, lhsCount, rhs) &&
				areMergeableChangeAtoms(lhsMoveOut.finalEndpoint, lhsCount, rhs.finalEndpoint)
			) {
				return lhsMoveOut;
			}
			break;
		}
		case "Insert": {
			const lhsInsert = lhs as Insert;
			if ((lhsInsert.id as number) + lhsCount === rhs.id) {
				return lhsInsert;
			}
			break;
		}
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
export function splitMark<T, TMark extends Mark<T> & Partial<VestigialEndpoint>>(
	mark: TMark,
	length: number,
): [TMark, TMark] {
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
	if (isVestigialEndpoint(mark2)) {
		mark2.vestigialEndpoint = splitDetachEvent(mark2.vestigialEndpoint, length);
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
				id: (effect.id as number) + length,
			};
			return [effect1, effect2];
		}
		case "MoveIn": {
			const effect2: TEffect = { ...effect, id: (effect.id as number) + length };
			const move2 = effect2 as MoveIn;
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
			if (effect2Delete.redetachId !== undefined) {
				effect2Delete.redetachId = splitDetachEvent(effect2Delete.redetachId, length);
			}
			return [effect1, effect2];
		}
		case "MoveOut": {
			const effect2 = {
				...effect,
				id: (effect.id as number) + length,
			};

			const return2 = effect2 as MoveOut;

			if (return2.redetachId !== undefined) {
				return2.redetachId = splitDetachEvent(return2.redetachId, length);
			}

			if (return2.finalEndpoint !== undefined) {
				return2.finalEndpoint = splitDetachEvent(return2.finalEndpoint, length);
			}
			return [effect, effect2];
		}
		case "AttachAndDetach": {
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
		default:
			unreachableCase(type);
	}
}

function splitDetachEvent(detachEvent: CellId, length: number): CellId {
	return { ...detachEvent, localId: brand((detachEvent.localId as number) + length) };
}

/**
 * @returns -1 if the lineage indicates that cell1 is earlier in the field than cell2.
 * Returns 1 if cell2 is earlier in the field.
 * Returns 0 if the order cannot be determined from the lineage.
 */
export function compareLineages(cell1: CellId, cell2: CellId): number {
	const cell1Events = new Map<RevisionTag, LineageEvent>();
	for (const event of cell1.lineage ?? []) {
		// TODO: Are we guaranteed to only have one distinct lineage event per revision?
		cell1Events.set(event.revision, event);
	}

	const lineage2 = cell2.lineage ?? [];
	for (let i = lineage2.length - 1; i >= 0; i--) {
		const event = lineage2[i];
		const offset1 = cell1Events.get(event.revision)?.offset;
		if (offset1 !== undefined) {
			const offset2 = event.offset;
			cell1Events.delete(event.revision);
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

// TODO: Refactor MarkEffect into a field of CellMark so this function isn't necessary.
export function omitMarkEffect<TChildChange>(
	mark: CellMark<unknown, TChildChange>,
): CellMark<NoopMark, TChildChange> {
	const { cellId, count, changes } = mark;
	const noopMark: CellMark<NoopMark, TChildChange> = { count };
	if (cellId !== undefined) {
		noopMark.cellId = cellId;
	}
	if (changes !== undefined) {
		noopMark.changes = changes;
	}
	return noopMark;
}

export function withNodeChange<
	TMark extends CellMark<TKind, TNodeChange>,
	TKind extends MarkEffect,
	TNodeChange,
>(mark: TMark, changes: TNodeChange | undefined): TMark {
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

	if (effect.type === "AttachAndDetach") {
		addRevision(effect.attach, revision);
		addRevision(effect.detach, revision);
		return;
	}

	assert(
		effect.revision === undefined || effect.revision === revision,
		0x829 /* Should not overwrite mark revision */,
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
