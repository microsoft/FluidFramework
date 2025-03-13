/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionMetadataSource,
	type RevisionTag,
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	makeChangeAtomId,
} from "../../core/index.js";
import { type Mutable, brand, fail } from "../../util/index.js";
import {
	CrossFieldTarget,
	type NodeId,
	type CrossFieldKeyRange,
	type NestedChangesIndices,
} from "../modular-schema/index.js";

import type {
	CellRename,
	DetachOfRemovedNodes,
	EmptyInputCellMark,
	MoveMarkEffect,
} from "./helperTypes.js";
import {
	type Attach,
	type AttachAndDetach,
	type CellId,
	type CellMark,
	type Changeset,
	type Detach,
	type DetachFields,
	type HasRevisionTag,
	type Insert,
	type Mark,
	type MarkEffect,
	type MoveIn,
	type MoveOut,
	type NoopMark,
	NoopMarkType,
	type Remove,
	type CellCount,
	type Rename,
} from "./types.js";

export function isEmpty(change: Changeset): boolean {
	for (const mark of change) {
		if (mark.changes !== undefined || mark.type !== undefined) {
			return false;
		}
	}
	return true;
}

export function createEmpty(): Changeset {
	return [];
}

export function getNestedChanges(change: Changeset): NestedChangesIndices {
	const output: NestedChangesIndices = [];
	let inputIndex = 0;
	let outputIndex = 0;
	for (const mark of change) {
		const { changes, count } = mark;
		if (changes !== undefined) {
			output.push([
				changes,
				!areInputCellsEmpty(mark) ? inputIndex : undefined /* inputIndex */,
				!areOutputCellsEmpty(mark) ? outputIndex : undefined /* outputIndex */,
			]);
		}
		if (!areInputCellsEmpty(mark)) {
			inputIndex += count;
		}

		if (!areOutputCellsEmpty(mark)) {
			outputIndex += count;
		}
	}
	return output;
}

export function isNewAttach(mark: Mark, revision?: RevisionTag): boolean {
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

export function isRename(mark: MarkEffect): mark is Rename {
	return mark.type === "Rename";
}

export function isInsert(mark: MarkEffect): mark is Insert {
	return mark.type === "Insert";
}

export function isAttach(effect: MarkEffect): effect is Attach {
	return effect.type === "Insert" || effect.type === "MoveIn";
}

export function isReattach(mark: Mark): boolean {
	return isReattachEffect(mark, mark.cellId);
}

export function isReattachEffect(effect: MarkEffect, cellId: CellId | undefined): boolean {
	return isAttach(effect) && !isNewAttachEffect(effect, cellId);
}

export function isActiveReattach(
	mark: Mark,
): mark is CellMark<Insert> & { conflictsWith?: undefined } {
	return isAttach(mark) && isReattachEffect(mark, mark.cellId) && mark.cellId !== undefined;
}

export function areEqualCellIds(a: CellId | undefined, b: CellId | undefined): boolean {
	return areEqualChangeAtomIdOpts(a, b);
}

export function getInputCellId(mark: Mark): CellId | undefined {
	return mark.cellId;
}

export function getOutputCellId(mark: Mark): CellId | undefined {
	if (isDetach(mark) || isRename(mark)) {
		return getDetachOutputCellId(mark);
	} else if (markFillsCells(mark)) {
		return undefined;
	} else if (isAttachAndDetachEffect(mark)) {
		return getDetachOutputCellId(mark.detach);
	}

	return getInputCellId(mark);
}

export function cellSourcesFromMarks(
	marks: readonly Mark[],
	contextGetter: typeof getInputCellId | typeof getOutputCellId,
): Set<RevisionTag | undefined> {
	const set = new Set<RevisionTag | undefined>();
	for (const mark of marks) {
		const cell = contextGetter(mark);
		if (cell !== undefined) {
			set.add(cell.revision);
		}
	}
	return set;
}

export enum CellOrder {
	SameCell,
	OldThenNew,
	NewThenOld,
}

/**
 * Determines the order of two cells from two changesets.
 *
 * This function makes the following assumptions:
 * 1. The cells represent the same context.
 * 2. `oldMarkCell` is from a mark in a changeset that is older than the changeset that contains the mark that
 * `newMarkCell` is from.
 * 3. In terms of sequence index, all cells located before A are also located before B,
 * and all cells located before B are also located before A.
 * 4. If a changeset has a mark/tombstone that describes a cell named in some revision R,
 * then that changeset must contain marks/tombstones for all cells named in R as well as all cells named in later
 * revisions up to its own.
 * 5. If a changeset foo is rebased over a changeset bar, then the rebased version of foo must contain tombstones or
 * marks for all cells referenced or named in bar. It has yet to be determined whether this assumption is necessary
 * for the logic below.
 *
 * @param oldMarkCell - The cell referenced or named by a mark or tombstone from the older changeset.
 * @param newMarkCell - The cell referenced or named by a mark or tombstone from the newer changeset.
 * @param oldChangeKnowledge - The set of revisions that the older changeset has cell representations for.
 * @param newChangeKnowledge - The set of revisions that the newer changeset has cell representations for.
 * @param metadata - Revision metadata for the operation being carried out.
 * @returns a {@link CellOrder} which describes how the cells are ordered relative to one-another.
 */
export function compareCellPositionsUsingTombstones(
	oldMarkCell: ChangeAtomId,
	newMarkCell: ChangeAtomId,
	oldChangeKnowledge: ReadonlySet<RevisionTag | undefined>,
	newChangeKnowledge: ReadonlySet<RevisionTag | undefined>,
	metadata: RevisionMetadataSource,
): CellOrder {
	if (areEqualChangeAtomIds(oldMarkCell, newMarkCell)) {
		return CellOrder.SameCell;
	}
	const oldChangeKnowsOfNewMarkCellRevision = oldChangeKnowledge.has(newMarkCell.revision);
	const newChangeKnowsOfOldMarkCellRevision = newChangeKnowledge.has(oldMarkCell.revision);
	if (oldChangeKnowsOfNewMarkCellRevision && newChangeKnowsOfOldMarkCellRevision) {
		// If both changesets know of both cells, but we've been asked to compare different cells,
		// Then either the changesets they originate from do not represent the same context,
		// or the ordering of their cells in inconsistent.
		// The only exception to this is when we're composing anonymous changesets in a transaction.
		assert(
			oldMarkCell.revision === undefined && newMarkCell.revision === undefined,
			0x8a0 /* Inconsistent cell ordering */,
		);
		// We are composing anonymous changesets in a transaction. The new changeset is creating a cell in a gap
		// where the old changeset knows of some now empty cell. We order the new cell relative to the old cell in a
		// way that is consistent with its tie-breaking behavior should the old cell be concurrently re-filled.
		// Since only tie-break left is supported at the moment, the new cell comes first.
		return CellOrder.NewThenOld;
	}
	if (newChangeKnowsOfOldMarkCellRevision) {
		// The changeset that contains `newMarkCell` has tombstones for the revision that created `oldMarkCell`,
		// so a tombstone/mark matching `oldMarkCell` must occur later in the newer changeset.
		return CellOrder.NewThenOld;
	} else if (oldChangeKnowsOfNewMarkCellRevision) {
		// The changeset that contains `oldMarkCell` has tombstones for revision that created `newMarkCell`,
		// so a tombstone/mark matching `newMarkCell` must occur later in the older changeset.
		return CellOrder.OldThenNew;
	} else {
		// These cells are only ordered through tie-breaking.
		// Since tie-breaking is hard-coded to "merge left", the younger cell comes first.

		// In the context of compose, an undefined revision means we are composing anonymous changesets into
		// a transaction, which means the cell from the newer changeset is younger.
		if (newMarkCell.revision === undefined) {
			return CellOrder.NewThenOld;
		}
		// The only case where the old mark cell should have no revision is when composing anonymous changesets
		// into a transaction, in which case the new mark cell should also have no revision, which is handled above.
		// In all other cases, the old mark cell should have a revision.
		assert(
			oldMarkCell.revision !== undefined,
			0x8a1 /* Old mark cell should have a revision */,
		);

		// Note that these indices are for ordering the revisions in which the cells were named, not the revisions
		// of the changesets in which the marks targeting these cells appear.
		const oldCellRevisionIndex = metadata.getIndex(oldMarkCell.revision);
		const newCellRevisionIndex = metadata.getIndex(newMarkCell.revision);

		// If the metadata defines an ordering for the revisions then the cell from the newer revision comes first.
		if (newCellRevisionIndex !== undefined && oldCellRevisionIndex !== undefined) {
			return newCellRevisionIndex > oldCellRevisionIndex
				? CellOrder.NewThenOld
				: CellOrder.OldThenNew;
		}

		if (newCellRevisionIndex === undefined && oldCellRevisionIndex === undefined) {
			// While it is possible for both marks to refer to cells that were named in revisions that are outside
			// the scope of the metadata, such a scenario should be handled above due to the fact that one of the two
			// changesets should have tombstones or marks for both cells.
			//
			// To see this in the context of rebase, we must consider the lowest common ancestor (LCA) of each change's
			// original (i.e., unrebased) edit with the head of the branch they will both reside on after the rebase.
			// ...─(Ti)─...─(Tj)─...─(old')─(new') <- branch both change will reside on after rebase
			//        |        └─...─(new)
			//        └─...─(old)
			// In the diagram above we can see that by the time `new` is being rebased over `old`, both changesets have
			// been rebased over, and therefore have cell information for, changes `Tj` onwards. This means that one of
			// The two changesets (the `old` one in the diagram above) will have tombstones or marks for any cells that
			// `new` refers to so long as those cells were not created on `new`'s branch.
			// Note that the change that contains the superset of cells (again, ignoring cells created on the other
			// change's branch) is not always the older change. Consider the following scenario:
			// ...─(Ti)─...─(Tj)─...─(old')─(new')
			//        |        └─...─(old)
			//        └─...─(new)
			//
			// The same scenario can arise in the context of compose (just consider composing `old'` and `new'` from
			// the examples above) with the same resolution.
			assert(false, 0x8a2 /* Invalid cell ordering scenario */);
		}

		// The absence of metadata for a cell with a defined revision means that the cell is from a revision that
		// predates the edits that are within the scope of the metadata. Such a cell is therefore older than the one
		// for which we do have metadata.
		return oldCellRevisionIndex === undefined ? CellOrder.NewThenOld : CellOrder.OldThenNew;
	}
}

/**
 * @returns the ID of the cell in the output context of the given detach `mark`.
 */
export function getDetachOutputCellId(mark: Detach | Rename): ChangeAtomId {
	if (isRename(mark)) {
		return mark.idOverride;
	}
	if (mark.idOverride !== undefined) {
		return mark.idOverride;
	}
	return mark.revision === undefined
		? { localId: mark.id }
		: { revision: mark.revision, localId: mark.id };
}

/**
 * @returns the ID of the detached node in the output context of the given detach `mark`.
 */
export function getDetachedNodeId(mark: Detach | Rename): ChangeAtomId {
	switch (mark.type) {
		case "Rename":
		case "Remove": {
			return getDetachOutputCellId(mark);
		}
		case "MoveOut": {
			return makeChangeAtomId(mark.id, mark.revision);
		}
		default:
			unreachableCase(mark);
	}
}

/**
 * Preserves the semantics of the given `mark` but repackages it into a `DetachOfRemovedNodes` when possible.
 */
export function normalizeCellRename(
	cellId: CellId,
	count: CellCount,
	attach: Attach,
	detach: Detach,
): CellMark<AttachAndDetach | DetachOfRemovedNodes | Rename | NoopMark> {
	if (attach.type === "MoveIn") {
		if (detach.type === "MoveOut") {
			const outputId = getDetachOutputCellId(detach);
			// Note that the output ID may be the same as the cellId. In such a scenario,
			// we output an (impact-less) Rename mark anyway (as opposed to a Skip)
			// because the resulting Rename may be rebased over other changes that rename the input cell,
			// eventually leading to an impactful rename.
			return {
				type: "Rename",
				count,
				cellId,
				idOverride: outputId,
			};
		}
	} else {
		// Normalization: when the attach is an insert/revive, we rely on the implicit reviving semantics of the
		// detach instead of using an explicit revive effect in an AttachAndDetach
		return {
			...detach,
			count,
			cellId,
		};
	}
	return {
		type: "AttachAndDetach",
		attach,
		detach,
		count,
		cellId,
	};
}

/**
 * Preserves the semantics of the given `mark` but repackages it into an `AttachAndDetach` mark if it is not already one.
 */
export function asAttachAndDetach(mark: CellMark<CellRename>): CellMark<AttachAndDetach> {
	if (mark.type === "AttachAndDetach") {
		return mark;
	}
	const { cellId, count, changes, revision, ...effect } = mark;
	const attachAndDetach: CellMark<AttachAndDetach | Detach> = {
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

export function cloneMark<TMark extends Mark>(mark: TMark): TMark {
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
	return cloned;
}

/**
 * @param mark - The mark to get the length of.
 * @param ignorePairing - When true, the length of a paired mark (e.g. MoveIn/MoveOut) whose matching mark is not active
 * will be treated the same as if the matching mark were active.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: Mark, ignorePairing: boolean = false): number {
	return areOutputCellsEmpty(mark) ? 0 : mark.count;
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: Mark): number {
	return areInputCellsEmpty(mark) ? 0 : mark.count;
}

export function markEmptiesCells(mark: Mark): boolean {
	return !areInputCellsEmpty(mark) && areOutputCellsEmpty(mark);
}

export function markFillsCells(mark: Mark): boolean {
	return areInputCellsEmpty(mark) && !areOutputCellsEmpty(mark);
}

export function markHasCellEffect(mark: Mark): boolean {
	return areInputCellsEmpty(mark) !== areOutputCellsEmpty(mark);
}

export function isAttachAndDetachEffect(effect: MarkEffect): effect is AttachAndDetach {
	return effect.type === "AttachAndDetach";
}

export function isDetachOfRemovedNodes(mark: Mark): mark is CellMark<DetachOfRemovedNodes> {
	return isDetach(mark) && mark.cellId !== undefined;
}

export function isImpactfulCellRename(mark: Mark): mark is CellMark<CellRename> {
	return (isAttachAndDetachEffect(mark) || isDetachOfRemovedNodes(mark)) && isImpactful(mark);
}

export function areInputCellsEmpty(mark: Mark): mark is EmptyInputCellMark {
	return mark.cellId !== undefined;
}

export function areOutputCellsEmpty(mark: Mark): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return mark.cellId !== undefined;
		case "Remove":
		case "Rename":
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
 * @returns either the original mark or a shallow clone of it with effects stripped out.
 */
export function settleMark(mark: Mark): Mark {
	if (isImpactful(mark)) {
		return mark;
	}
	return omitMarkEffect(mark);
}

/**
 * @returns true, iff the given `mark` would have impact on the field when applied.
 * Ignores the impact of nested changes.
 * CellRename effects are considered impactful if they actually change the ID of the cells.
 */
export function isImpactful(mark: Mark): boolean {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return false;
		case "Rename":
			return true;
		case "Remove": {
			const inputId = getInputCellId(mark);
			if (inputId === undefined) {
				return true;
			}
			const outputId = getOutputCellId(mark);
			assert(outputId !== undefined, 0x824 /* Remove marks must have an output cell ID */);
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

export function isTombstone(mark: Mark): mark is CellMark<NoopMark> & { cellId: CellId } {
	return mark.type === NoopMarkType && mark.cellId !== undefined && mark.changes === undefined;
}

export function isNoopMark(mark: Mark): mark is CellMark<NoopMark> {
	return mark.type === NoopMarkType;
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
	assert(
		cell1.revision === cell2.revision,
		0x85b /* Expected cells to have the same revision */,
	);
	if (areOverlappingIdRanges(cell1.localId, count1, cell2.localId, count2)) {
		return cell1.localId - cell2.localId;
	}
	return undefined;
}

export function isDetach(mark: MarkEffect | undefined): mark is Detach {
	const type = mark?.type;
	return type === "Remove" || type === "MoveOut";
}

export function isRemoveMark(mark: Mark | undefined): mark is CellMark<Remove> {
	return mark?.type === "Remove";
}

function areMergeableChangeAtoms(
	lhs: ChangeAtomId | undefined,
	lhsCount: number,
	rhs: ChangeAtomId | undefined,
): boolean {
	if (lhs === undefined || rhs === undefined) {
		return lhs === undefined && rhs === undefined;
	}

	return (
		lhs.revision === rhs.revision && areAdjacentIdRanges(lhs.localId, lhsCount, rhs.localId)
	);
}

function areAdjacentIdRanges(
	firstStart: ChangesetLocalId,
	firstLength: number,
	secondStart: ChangesetLocalId,
): boolean {
	return (firstStart as number) + firstLength === secondStart;
}

function haveMergeableIdOverrides(
	lhs: DetachFields,
	lhsCount: number,
	rhs: DetachFields,
): boolean {
	if (lhs.idOverride !== undefined && rhs.idOverride !== undefined) {
		return areMergeableCellIds(lhs.idOverride, lhsCount, rhs.idOverride);
	}
	return (lhs.idOverride === undefined) === (rhs.idOverride === undefined);
}

function areMergeableCellIds(
	lhs: CellId | undefined,
	lhsCount: number,
	rhs: CellId | undefined,
): boolean {
	return areMergeableChangeAtoms(lhs, lhsCount, rhs);
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `lhs` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `undefined` is returned, `lhs` is left untouched.
 */
export function tryMergeMarks(lhs: Mark, rhs: Readonly<Mark>): Mark | undefined {
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

	if (
		(lhs as Partial<HasRevisionTag>).revision !== (rhs as Partial<HasRevisionTag>).revision
	) {
		return undefined;
	}

	if (isDetach(lhs) && isDetach(rhs) && !haveMergeableIdOverrides(lhs, lhsCount, rhs)) {
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
		case "Remove": {
			const lhsDetach = lhs as Remove;
			if (
				(lhsDetach.id as number) + lhsCount === rhs.id &&
				haveMergeableIdOverrides(lhsDetach, lhsCount, rhs)
			) {
				return lhsDetach;
			}
			break;
		}
		case "Rename": {
			const lhsDetach = lhs as Rename;
			if (haveMergeableIdOverrides(lhsDetach, lhsCount, rhs)) {
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
export function splitMark<TMark extends Mark>(mark: TMark, length: number): [TMark, TMark] {
	const markLength = mark.count;
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail(0xb2d /* Unable to split mark due to lengths */);
	}

	const [effect1, effect2] = splitMarkEffect(mark, length);
	const mark1 = { ...mark, ...effect1, count: length };
	const mark2 = { ...mark, ...effect2, count: remainder };
	if (mark2.cellId !== undefined) {
		mark2.cellId = splitDetachEvent(mark2.cellId, length);
	}

	return [mark1, mark2];
}

export function splitMarkEffect<TEffect extends MarkEffect>(
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
		case "Remove": {
			const effect1 = { ...effect };
			const id2: ChangesetLocalId = brand((effect.id as number) + length);
			const effect2 = { ...effect, id: id2 };
			const effect2Remove = effect2 as Mutable<Remove>;
			if (effect2Remove.idOverride !== undefined) {
				effect2Remove.idOverride = splitDetachEvent(effect2Remove.idOverride, length);
			}
			return [effect1, effect2];
		}
		case "Rename": {
			const effect1 = { ...effect };
			const effect2 = { ...effect };
			const effect2Rename = effect2 as Mutable<Rename>;
			if (effect2Rename.idOverride !== undefined) {
				effect2Rename.idOverride = splitDetachEvent(effect2Rename.idOverride, length);
			}
			return [effect1, effect2];
		}
		case "MoveOut": {
			const effect2 = {
				...effect,
				id: (effect.id as number) + length,
			};

			const return2 = effect2 as Mutable<MoveOut>;

			if (return2.idOverride !== undefined) {
				return2.idOverride = splitDetachEvent(return2.idOverride, length);
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

// TODO: Refactor MarkEffect into a field of CellMark so this function isn't necessary.
export function extractMarkEffect<TEffect extends MarkEffect>(
	mark: CellMark<TEffect>,
): TEffect {
	const { cellId: _cellId, count: _count, changes: _changes, ...effect } = mark;
	return effect as unknown as TEffect;
}

// TODO: Refactor MarkEffect into a field of CellMark so this function isn't necessary.
export function omitMarkEffect(mark: CellMark<unknown>): CellMark<NoopMark> {
	const { cellId, count, changes } = mark;
	const noopMark: CellMark<NoopMark> = { count };
	if (cellId !== undefined) {
		noopMark.cellId = cellId;
	}
	if (changes !== undefined) {
		noopMark.changes = changes;
	}
	return noopMark;
}

export function withNodeChange<TMark extends CellMark<TKind>, TKind extends MarkEffect>(
	mark: TMark,
	changes: NodeId | undefined,
): TMark {
	const newMark = { ...mark };
	if (changes !== undefined) {
		newMark.changes = changes;
	} else {
		delete newMark.changes;
	}
	return newMark;
}

export function withRevision<TMark extends Mark>(
	mark: TMark,
	revision: RevisionTag | undefined,
): TMark {
	if (revision === undefined) {
		return mark;
	}

	const cloned = cloneMark(mark);
	addRevision(cloned, revision);
	if (
		cloned.cellId !== undefined &&
		cloned.cellId.revision === undefined &&
		revision !== undefined
	) {
		(cloned.cellId as Mutable<CellId>).revision = revision;
	}
	return cloned;
}

function addRevision(effect: MarkEffect, revision: RevisionTag): void {
	if (effect.type === NoopMarkType || isRename(effect)) {
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

export function getEndpoint(effect: MoveMarkEffect): ChangeAtomId {
	return effect.finalEndpoint ?? { revision: effect.revision, localId: effect.id };
}

export function getCrossFieldKeys(change: Changeset): CrossFieldKeyRange[] {
	const keys: CrossFieldKeyRange[] = [];
	for (const mark of change) {
		keys.push(...getCrossFieldKeysForMarkEffect(mark, mark.count));
	}

	return keys;
}

function getCrossFieldKeysForMarkEffect(
	effect: MarkEffect,
	count: number,
): CrossFieldKeyRange[] {
	switch (effect.type) {
		case "Insert":
			// An insert behaves like a move where the source and destination are at the same location.
			// An insert can become a move when after rebasing.
			return [
				{
					key: {
						target: CrossFieldTarget.Source,
						revision: effect.revision,
						localId: effect.id,
					},
					count,
				},
				{
					key: {
						target: CrossFieldTarget.Destination,
						revision: effect.revision,
						localId: effect.id,
					},
					count,
				},
			];
		case "MoveOut":
			return [
				{
					key: {
						target: CrossFieldTarget.Source,
						revision: effect.revision,
						localId: effect.id,
					},
					count,
				},
			];
		case "MoveIn":
			return [
				{
					key: {
						target: CrossFieldTarget.Destination,
						revision: effect.revision,
						localId: effect.id,
					},
					count,
				},
			];
		case "AttachAndDetach":
			return [
				...getCrossFieldKeysForMarkEffect(effect.attach, count),
				...getCrossFieldKeysForMarkEffect(effect.detach, count),
			];
		default:
			return [];
	}
}
