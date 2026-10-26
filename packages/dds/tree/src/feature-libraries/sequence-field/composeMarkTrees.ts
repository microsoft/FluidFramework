/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * PROTOTYPE.
 *
 * A `MarkTree`-based replacement for `composeMarkLists`/`ComposeQueue` (see
 * `compose.ts`). Reuses the real, unmodified mark-merging logic
 * (`composeMarks`/`createNoopMark`/`getMovedChangesFromMark`, exported from
 * `compose.ts` for this purpose) for every mark pair that genuinely needs to
 * be merged, so composing marks that *do* interact is exactly as correct as
 * today's implementation. The new part is the alignment loop around it,
 * which — for the specific case the design goal is about (a plain no-op
 * mark from one side aligned with a run of many smaller marks on the other)
 * — reuses that whole run by reference via `MarkTree.splitAt`/`concat`,
 * never visiting the marks inside it.
 *
 * ## Scope of this prototype (read before relying on this for anything real)
 *
 * The bulk-skip optimization below only ever fires on a run that's
 * structurally guaranteed to compose against a no-op as a no-op, *and* is
 * capped at the first mark (if any) that would have forced the real
 * per-mark algorithm to switch branches (which also rules out ever
 * bulk-copying through a move mark, since a move mark is always such a
 * boundary) — see the long comment above `tryBulkSkip` for the full,
 * branch-by-branch argument, including a real bug this exact reasoning
 * caught during testing (see the comment on `takeSoloBase`).
 *
 * What is explicitly *not* attempted here:
 * - The "one side's cell is structurally empty" branches (an `Insert`/
 * `Remove`/`MoveIn`/`MoveOut`/`Rename` on one side with nothing to pair
 * against yet on the other) are handled one mark at a time, exactly like
 * `ComposeQueue.dequeueBase`/`dequeueNew` do today. A changeset consisting
 * of many *separate* attaches/detaches in a row (as opposed to one big
 * no-op aligned with many small marks) could in principle benefit from
 * the same kind of bulk handling; this prototype doesn't attempt it.
 * - The "transaction squashing" edge case in the real `ComposeQueue.pop()`
 * (`markEmptiesCells(baseMark) && baseCellId.revision === undefined`) is
 * not replicated.
 * - Tombstone pruning is not attempted (matching the real `compose.ts`'s own
 * "WARNING! This implementation is incomplete" disclaimer).
 */

import { unreachableCase, fail } from "@fluidframework/core-utils/internal";

import type { RevisionMetadataSource } from "../../core/index.js";
import type { NodeChangeComposer } from "../modular-schema/index.js";

import { composeMarks, createNoopMark, getMovedChangesFromMark } from "./compose.js";
import { markTreeFromArray, type MarkTree } from "./markTree.js";
import { getFirstMoveEffectLength, type MoveEffectTable } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import {
	CellOrder,
	areInputCellsEmpty,
	areOutputCellsEmpty,
	cellSourcesFromMarks,
	compareCellPositionsUsingTombstones,
	getInputCellId,
	getOutputCellId,
	isNoopMark,
	settleMark,
	splitMark,
} from "./utils.js";

/**
 * A mark with neither a local edit nor changes to children - the narrower
 * definition the design doc uses for "no-op mark" (a plain `{count: N}`
 * skip, as opposed to any mark whose `type` happens to be undefined but
 * which still carries a `cellId` and/or `changes`).
 */
function isPureNoOp(mark: Mark): boolean {
	return isNoopMark(mark) && mark.cellId === undefined && mark.changes === undefined;
}

/**
 * A mark whose `settleMark(...)` result is a *different shape* than the mark
 * itself - i.e. `isImpactful(mark) === false` while the mark isn't already a
 * plain no-op. The only mark shape reaching the "neither side empties/fills
 * a cell" branch (see `tryBulkSkip`'s doc comment) for which this is true is
 * an `Insert` with no `cellId` - a "pin", `createPinMark`'s shape - which
 * `settleMark` reduces to a plain no-op because reviving already-visible
 * content has no effect. (Checked exhaustively against `isImpactful` in
 * `utils.ts`: every *other* mark type able to reach that branch is either
 * already a plain no-op there, or is unconditionally impactful regardless of
 * `cellId` - `Rename`, `MoveOut`, `MoveIn`, `AttachAndDetach` always are, and
 * a `Remove` reaching that branch is always one with no `cellId`, which
 * `isImpactful`'s `Remove` case always treats as impactful too.)
 *
 * This matters because `composeMarkLists` always calls `settleMark` on both
 * marks *before* composing them (see `composeMarkLists` in `compose.ts`) -
 * so a bulk-copied run that silently included a raw, unsettled pin would
 * reproduce a structurally different mark than composing it one-at-a-time
 * would have. Marks like this must therefore act as a boundary, exactly
 * like a genuine attach/detach: the reused run must stop right before one,
 * falling back to `mergeOnePair` (which settles internally) to process it.
 */
function isSettleSensitive(mark: Mark): boolean {
	return mark.type === "Insert" && mark.cellId === undefined;
}

/**
 * A mark whose composition can register or consume cross-field move-effect
 * bookkeeping (`MoveIn`, `MoveOut`, and `AttachAndDetach`, since the latter
 * can wrap a move on either side - see `handleMovePivot`/`withUpdatedEndpoint`
 * in `compose.ts`). This is deliberately a broader, type-based check, *not*
 * derived from `areInputCellsEmpty`/`areOutputCellsEmpty`: those flags say
 * a `MoveIn` (as `baseMark`) or a `MoveOut` with no `cellId` (as `newMark`)
 * are *not* boundaries (their occupied-both-sides shape is exactly why they
 * can reach the "neither side empties/fills a cell" branch at all - see
 * `tryBulkSkip`'s doc comment) - but reusing either raw would silently skip
 * `withUpdatedEndpoint`'s move-chain bookkeeping (collapsing a chain's
 * `finalEndpoint`, and respecting any *shorter* length another mark
 * elsewhere in the same compose call already registered for this exact
 * `(revision, id)` range via `setEndpoint`/`setMoveEffect` - see
 * `getFirstMoveEffectLength`, and `mergeOnePair`/`takeSoloBase`/
 * `takeSoloNew`'s own use of it below). So every move-involving mark must
 * be excluded from ever being silently absorbed into a bulk-copied run,
 * regardless of which side of the pairing it's on.
 */
function isMoveEffectRelated(mark: Mark): boolean {
	const type = mark.type;
	return type === "MoveIn" || type === "MoveOut" || type === "AttachAndDetach";
}

/**
 * Splits `mark` at the point (if any, strictly before its own end) where a
 * move effect previously registered elsewhere in this same compose call -
 * by processing some *other* mark tied to the same `(revision, id)` range,
 * earlier in this same left-to-right pass - takes over from its own natural
 * length. Returns `[mark, undefined]` unchanged when there's nothing to
 * split off (the overwhelmingly common case: no move chain collapsing is
 * in play for this mark at all).
 *
 * This mirrors `MarkQueue`'s own `getLengthForSplit` override (see
 * `markQueue.ts`), which the real `ComposeQueue` consults on *every* dequeue
 * for exactly this reason - `composeMarkTrees` has no equivalent "dequeue"
 * chokepoint (it reads straight from the `MarkTree`s), so every place that
 * is about to individually compose a move-involving mark must call this
 * first instead.
 */
function splitAtMoveEffectBoundary(mark: Mark, moveEffects: MoveEffectTable): [Mark, Mark | undefined] {
	if (!isMoveEffectRelated(mark)) {
		return [mark, undefined];
	}
	const cap = getFirstMoveEffectLength(mark, mark.count, moveEffects);
	if (cap >= mark.count) {
		return [mark, undefined];
	}
	return splitMark(mark, cap);
}

/**
 * Records, in a single left-to-right pass (so the result is naturally
 * sorted), the offset at which every mark satisfying `isBoundaryStart`
 * begins. Built once per input changeset, alongside the one-time cost of
 * reading every mark that `MarkTree`'s own construction already pays - this
 * is not a new O(n) cost on top of that, it's part of it.
 */
function findBoundaryStarts(marks: readonly Mark[], isBoundaryStart: (mark: Mark) => boolean): number[] {
	const starts: number[] = [];
	let offset = 0;
	for (const mark of marks) {
		if (isBoundaryStart(mark)) {
			starts.push(offset);
		}
		offset += mark.count;
	}
	return starts;
}

/**
 * Binary search for the smallest recorded boundary start at or after
 * `offset` (or `Number.POSITIVE_INFINITY` if there is none) - i.e. "how far
 * from `offset` can we go before hitting a boundary." Deliberately *not*
 * "strictly after": unlike a genuine attach/detach (which, by the outer
 * branch condition that gates every call into `tryBulkSkip`, can never sit
 * exactly at the current offset), a settle-sensitive "pin" mark (see
 * `isSettleSensitive`) *can* be the very mark sitting at `offset` - and that
 * has to result in zero cells being reused, not a reuse that swallows it.
 * `sortedStarts` is expected to be small in practice for most realistic
 * changesets, but this is a real binary search (not a linear scan, unlike
 * `tryBulkSkip`'s move check in an earlier version of this file) since
 * *every* attach, detach, or settle-sensitive mark counts as a boundary
 * here, so this list is not reliably small.
 */
function firstBoundaryAtOrAfter(sortedStarts: readonly number[], offset: number): number {
	let lo = 0;
	let hi = sortedStarts.length;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if ((sortedStarts[mid] ?? fail("index in range")) < offset) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo < sortedStarts.length ? (sortedStarts[lo] ?? fail("index in range")) : Number.POSITIVE_INFINITY;
}

/**
 * Mirrors `ComposeQueue.dequeueBase`'s use of `getMovedChangesFromMark`:
 * consumes any node changes that were stashed against `mark`'s move id
 * (via `handleNodeChanges`'s `setModifyAfter`, elsewhere in the *same*
 * compose call). Returns them composed with `mark`'s own existing changes
 * (via `composeChild`) rather than asserting one of them is absent, since
 * unlike `ComposeQueue.dequeueBoth`'s use of this same helper (where the
 * branch's own structure guarantees `mark.changes` is absent whenever
 * `movedChanges` is present - see `tryBulkSkip`'s doc comment), the solo
 * "dequeueBase" case this is actually needed for has no such guarantee.
 */
function withMovedChanges(mark: Mark, moveEffects: MoveEffectTable, composeChild: NodeChangeComposer): Mark {
	const movedChanges = getMovedChangesFromMark(moveEffects, mark);
	if (movedChanges === undefined) {
		return mark;
	}
	return { ...mark, changes: composeChild(mark.changes, movedChanges) };
}

/**
 * Composes `baseTree` and `newTree`, in the same sense as `compose()` in
 * `compose.ts` composes two flat `Mark[]` changesets: the marks in `newTree`
 * are assumed to apply to the state produced by `baseTree`.
 */
export function composeMarkTrees(
	baseTree: MarkTree<Mark>,
	newTree: MarkTree<Mark>,
	composeChild: NodeChangeComposer,
	moveEffects: MoveEffectTable,
	revisionMetadata: RevisionMetadataSource,
	maxNodeSize = 32,
): MarkTree<Mark> {
	// One-time, O(n) cost - same order as `MarkTree`'s own construction cost,
	// and the same cost `ComposeQueue`'s constructor already pays today via
	// its own `cellSourcesFromMarks` calls over the full flat mark lists.
	const baseFlat = baseTree.toArray();
	const newFlat = newTree.toArray();
	const baseCellSources = cellSourcesFromMarks(baseFlat, getOutputCellId);
	const newCellSources = cellSourcesFromMarks(newFlat, getInputCellId);
	// See `tryBulkSkip`'s doc comment: these record where it is *not* safe to
	// keep bulk-copying a reused run, because: the real per-mark algorithm
	// would have switched branches (decoupling the two sides' advancement)
	// at that point (`areInputCellsEmpty`/`areOutputCellsEmpty`); settling
	// the mark there would change its shape (`isSettleSensitive`); or the
	// mark could carry or consume cross-field move-effect bookkeeping that
	// bulk-copying would silently skip (`isMoveEffectRelated`).
	const newAttachStarts = findBoundaryStarts(
		newFlat,
		(mark) => areInputCellsEmpty(mark) || isSettleSensitive(mark) || isMoveEffectRelated(mark),
	);
	const baseDetachStarts = findBoundaryStarts(
		baseFlat,
		(mark) => areOutputCellsEmpty(mark) || isSettleSensitive(mark) || isMoveEffectRelated(mark),
	);


	let remainingBase = baseTree;
	let remainingNew = newTree;
	let baseOffset = 0;
	let newOffset = 0;
	let output = markTreeFromArray<Mark>([], splitMark, () => undefined, maxNodeSize);

	const emitMarks = (marks: readonly Mark[]): void => {
		if (marks.length > 0) {
			// eslint-disable-next-line unicorn/prefer-spread -- MarkTree.concat, not Array.prototype.concat.
			output = output.concat(markTreeFromArray(marks, splitMark, () => undefined, maxNodeSize));
		}
	};
	const emitTree = (piece: MarkTree<Mark>): void => {
		if (piece.entryCount > 0) {
			// eslint-disable-next-line unicorn/prefer-spread -- MarkTree.concat, not Array.prototype.concat.
			output = output.concat(piece);
		}
	};

	/**
	 * Splits every mark in `marks` further at any move-effect boundary
	 * (`splitAtMoveEffectBoundary`), flattening the result. Needed before
	 * individually composing a "solo" run of marks one at a time (see
	 * `takeSoloBase`/`takeSoloNew`): even though move-involving marks are
	 * never *bulk*-copied (see `isMoveEffectRelated`), a solo run is still
	 * read out one *whole* tree-stored mark at a time, and a single such
	 * mark can still need *further* splitting if a move effect was
	 * registered - elsewhere in this same compose call, while processing
	 * some other, unrelated pair - for only part of its range.
	 */
	const splitAllAtMoveEffectBoundaries = (marks: readonly Mark[]): Mark[] => {
		const result: Mark[] = [];
		for (const mark of marks) {
			let remaining: Mark | undefined = mark;
			while (remaining !== undefined) {
				const [first, rest] = splitAtMoveEffectBoundary(remaining, moveEffects);
				result.push(first);
				remaining = rest;
			}
		}
		return result;
	};

	/**
	 * dequeueBase-equivalent: consume `length` cells' worth from
	 * `remainingBase` alone. Reuses the real `composeMarks` against a
	 * synthetic no-op partner (built via the real `createNoopMark`, exactly
	 * as `ComposeQueue.dequeueBase` does) rather than hand-reconstructing
	 * its settle/movedChanges/endpoint-update behavior - this is what
	 * revealed the "modify.ts:6:pin then no_change" bug during testing: a
	 * naive direct `composeMark` call skips `settleMark`, which the real
	 * `ComposeQueue.pop()` always applies even in this "solo" case (it never
	 * truly treats one side as literally absent internally - it always
	 * synthesizes a matching no-op and goes through `composeMarks`).
	 */
	const takeSoloBase = (length: number): void => {
		const [piece, restBase] = remainingBase.splitAt(length);
		const composedMarks = splitAllAtMoveEffectBoundaries(piece.toArray()).map((mark) => {
			const movedChanges = getMovedChangesFromMark(moveEffects, mark);
			const syntheticNew = createNoopMark(mark.count, movedChanges, getOutputCellId(mark));
			return composeMarks(settleMark(mark), syntheticNew, composeChild, moveEffects);
		});
		emitMarks(composedMarks);
		remainingBase = restBase;
		baseOffset += length;
	};

	/** dequeueNew-equivalent: consume `length` cells' worth from `remainingNew` alone. Same reasoning as `takeSoloBase`. */
	const takeSoloNew = (length: number): void => {
		const [piece, restNew] = remainingNew.splitAt(length);
		const composedMarks = splitAllAtMoveEffectBoundaries(piece.toArray()).map((mark) => {
			const settledNew = settleMark(mark);
			const syntheticBase = createNoopMark(settledNew.count, undefined, getInputCellId(settledNew));
			return composeMarks(syntheticBase, settledNew, composeChild, moveEffects);
		});
		emitMarks(composedMarks);
		remainingNew = restNew;
		newOffset += length;
	};

	/**
	 * dequeueBoth-equivalent (the "genuinely interacting" case): consumes
	 * exactly one aligned mark's worth from each side and merges them via
	 * the real, unmodified `composeMarks`. Shared by both call sites below
	 * (the tombstone-comparison `SameCell` case and the plain "neither side
	 * empties/fills a cell" case) so there is only one place declaring
	 * `length`/`baseP`/`restBase`/etc., rather than two copies shadowing
	 * each other in the same function scope.
	 */
	const mergeOnePair = (): void => {
		const { entry: baseMark } = remainingBase.atOffset(0);
		const { entry: newMark } = remainingNew.atOffset(0);
		// Capped the same way `MarkQueue.dequeue` caps every mark it hands
		// out (see `splitAtMoveEffectBoundary`): a move mark reaching here
		// can still be longer than a move effect registered elsewhere in
		// this same compose call says it should be treated as.
		const length = Math.min(
			baseMark.count,
			newMark.count,
			getFirstMoveEffectLength(baseMark, baseMark.count, moveEffects),
			getFirstMoveEffectLength(newMark, newMark.count, moveEffects),
		);
		const [baseP, restBase] = remainingBase.splitAt(length);
		const [newP, restNew] = remainingNew.splitAt(length);
		const mergedBase = withMovedChanges(settleMark(baseP.atOffset(0).entry), moveEffects, composeChild);
		const mergedNew = settleMark(newP.atOffset(0).entry);
		emitMarks([composeMarks(mergedBase, mergedNew, composeChild, moveEffects)]);
		remainingBase = restBase;
		remainingNew = restNew;
		baseOffset += length;
		newOffset += length;
	};

	while (remainingBase.totalCount > 0 && remainingNew.totalCount > 0) {
		const { entry: baseMark } = remainingBase.atOffset(0);
		const { entry: newMark } = remainingNew.atOffset(0);

		if (areOutputCellsEmpty(baseMark) && areInputCellsEmpty(newMark)) {
			const baseCellId = getOutputCellId(baseMark) ?? fail(0xa02 /* Expected defined output ID */);
			const newCellId = getInputCellId(newMark) ?? fail(0xa03 /* Expected defined input ID */);
			const order = compareCellPositionsUsingTombstones(
				baseCellId,
				newCellId,
				baseCellSources,
				newCellSources,
				revisionMetadata,
			);
			switch (order) {
				case CellOrder.SameCell: {
					mergeOnePair();
					break;
				}
				case CellOrder.OldThenNew: {
					takeSoloBase(baseMark.count);
					break;
				}
				case CellOrder.NewThenOld: {
					takeSoloNew(newMark.count);
					break;
				}
				default: {
					unreachableCase(order);
				}
			}
			continue;
		}

		if (areOutputCellsEmpty(baseMark)) {
			takeSoloBase(baseMark.count);
			continue;
		}

		if (areInputCellsEmpty(newMark)) {
			takeSoloNew(newMark.count);
			continue;
		}

		// Neither side structurally empties/fills a cell here: this is the
		// "dequeueBoth" regime, the *only* one that can pair a plain no-op
		// against a run of many smaller marks (see the file-level comment,
		// and `tryBulkSkip`'s own comment, for the full argument for why
		// that's the case and why bulk-skipping it is safe).
		//
		// `isPureNoOp` is deliberately checked here on the *unsettled*
		// marks: a mark like a redundant "pin" (an `Insert` with no
		// `cellId`, which `settleMark` reduces to a plain no-op, because
		// reviving already-visible content has no effect) would pass
		// `isPureNoOp` once settled, but bulk-copying would then reuse the
		// *unsettled* original as the "no-op" trigger itself - producing a
		// structurally different result than the real algorithm's, which
		// always settles before emitting. Checking pre-settling here simply
		// means a pin never triggers the fast path *as the no-op side*,
		// falling back to `mergeOnePair` below (which settles internally)
		// instead of risking that mismatch. A pin buried *inside* the
		// reused run on the *other* side is handled separately, by
		// `tryBulkSkip`'s boundary capping (`isSettleSensitive`).
		const bulk = tryBulkSkip(
			baseMark,
			newMark,
			remainingBase,
			remainingNew,
			baseOffset,
			newOffset,
			baseDetachStarts,
			newAttachStarts,
		);
		if (bulk !== undefined) {
			emitTree(bulk.reusedPiece);
			remainingBase = bulk.restBase;
			remainingNew = bulk.restNew;
			baseOffset += bulk.consumed;
			newOffset += bulk.consumed;
			continue;
		}

		// Ordinary aligned merge: exactly one mark's worth from each side -
		// this is the "genuinely interacting" case (an "interleaved pair",
		// in the design doc's terms), which is expected to cost individually.
		mergeOnePair();
	}

	// Leftovers: at most one side still has content, to be passed through solo.
	if (remainingBase.totalCount > 0) {
		takeSoloBase(remainingBase.totalCount);
	}
	if (remainingNew.totalCount > 0) {
		takeSoloNew(remainingNew.totalCount);
	}

	// Matches the real system's documented "we may ignore any unchanged full
	// cells at the end of the sequence" optimization (see the design notes
	// on why a changeset contains a mark for every full cell, *except*
	// trailing unchanged ones). Loops because `emitMarks`/`emitTree` don't
	// coalesce adjacent no-op marks from separate calls into one, so the
	// trailing "unchanged" region can be more than one mark.
	while (output.totalCount > 0) {
		const { entry: lastEntry } = output.atOffset(output.totalCount - 1);
		if (!isPureNoOp(lastEntry)) {
			break;
		}
		const [prefix] = output.splitAt(output.totalCount - lastEntry.count);
		output = prefix;
	}

	return output;
}

/**
 * Attempts the core optimization: reusing a whole run of marks from one side
 * by reference, because the *other* side's current mark is a plain no-op
 * covering (at least part of) that run.
 *
 * ## Why this is safe to do without inspecting most of the reused run's marks
 *
 * This is only ever called from the "neither side empties/fills a cell"
 * regime (`ComposeQueue`'s `dequeueBoth`). Tracing through every mark type's
 * `areOutputCellsEmpty`/`areInputCellsEmpty` definition:
 * - `Insert`/`MoveIn`/`Rename`/`AttachAndDetach` always target an empty
 * input cell (by definition - they're attaches), so as `newMark` they are
 * *always* diverted to the `areInputCellsEmpty(newMark)` branch, never
 * reaching here - *except* an `Insert` with no `cellId` (a "pin"), which is
 * the one attach-flavored mark whose *input* is deemed non-empty (see
 * `isSettleSensitive`'s doc comment for the exhaustive case analysis).
 * - `Remove`/`Rename`/`MoveOut`/`AttachAndDetach` always leave their output
 * cell empty (by definition - they're detaches), so as `baseMark` they are
 * *always* diverted to the `areOutputCellsEmpty(baseMark)` branch, never
 * reaching here.
 *
 * So a mark reaching this branch, on either side, can only be: a plain
 * no-op/`Modify`, an `Insert` (as `baseMark` only - its output is always
 * filled - with or without a `cellId`), or a `MoveIn` (as `baseMark` only),
 * or symmetrically a `Remove`/`MoveOut` (as `newMark` only, always with no
 * `cellId`). Composing a plain no-op (no `cellId`, no `changes`) against
 * *any* mark of these kinds *once both are settled* always yields that other
 * mark's *settled* form, structurally (`composeMarksIgnoreChild`'s very
 * first two branches: when `baseMark` is a no-op it returns `newMark`
 * unchanged, and when `newMark` is a no-op it returns `baseMark` unchanged -
 * but by the time `composeMarksIgnoreChild` is reached, `composeMarkLists`
 * has already replaced both marks with `settleMark(mark)`, see `compose.ts`)
 * - the only side effect composing them could otherwise have is
 * `handleNodeChanges`'s modifyAfter *stash*, which only triggers when the
 * *non-no-op* side has `.changes` - impossible here, since we require the
 * no-op side to be a plain no-op for its *entire* consumed length, meaning
 * the run reused unchanged is exactly what composing it against a no-op
 * would have produced one mark at a time anyway - *for every mark type
 * except a "pin"*, which `settleMark` reduces to a plain no-op instead of
 * reusing unchanged (see `isSettleSensitive`). That's why a pin must be
 * excluded from ever being silently absorbed into a reused run, rather than
 * being safe to reuse like every other mark type here.
 *
 * The one thing composing a mark still does, even when paired with a
 * no-op, that reusing it unchanged would miss, is `composeMark`'s call to
 * `withUpdatedEndpoint` - which can rewrite a move mark's `finalEndpoint`
 * to collapse a move chain.
 *
 * ## The other reasons this can't blindly reuse the whole no-op's length
 *
 * The argument above assumes *every* mark within the reused run stays
 * within the same "occupied on the relevant side" territory the no-op mark
 * itself established, *and* is settle-invariant, *and* carries no
 * move-effect bookkeeping. But the reused run can legitimately contain a
 * mark that violates any of these:
 * - One that *does* empty/fill a cell (e.g. new's run, being reused because
 * base is a no-op, might contain a plain skip followed by an `Insert` with
 * a `cellId`) - and the real per-mark `ComposeQueue` would have switched
 * from `dequeueBoth` to `dequeueNew`/`dequeueBase` (decoupling the two
 * sides' advancement) right at that boundary, taking the *entire* `Insert`
 * mark in one step regardless of how much of base's no-op remained. Blindly
 * bulk-copying past that boundary would incorrectly split that `Insert` at
 * whatever offset the no-op's own length happened to end at.
 * - One that's settle-sensitive (a pin) or move-effect-related (`MoveIn`/
 * `MoveOut`/`AttachAndDetach`) - both unsafe to reuse raw per the two
 * points above, despite *not* being a `ComposeQueue` branch-switch (their
 * "occupied both sides" shape is exactly why they don't trip the first
 * bullet).
 *
 * A hazard of the *first* kind, or of the *second* kind starting fresh
 * partway through the run, is caught the same way: the reused length is
 * capped at the nearest recorded boundary start (via `newAttachStarts`/
 * `baseDetachStarts`, which record all three predicates), falling back to
 * the per-mark path beyond it. A hazard of the *second* kind *already*
 * covering the run's very first cell - which can happen with no fresh
 * "start" anywhere at or after the current offset, if reading landed in the
 * middle of a long settle-sensitive/move-related mark via earlier,
 * unrelated pairings - is caught separately, above, by checking the actual
 * current mark rather than the precomputed boundary lists. Between the two,
 * a bulk-copied run is guaranteed to never contain, or begin with, a move
 * mark, making a separate move-specific check unnecessary.
 */
function tryBulkSkip(
	baseMark: Mark,
	newMark: Mark,
	remainingBase: MarkTree<Mark>,
	remainingNew: MarkTree<Mark>,
	baseOffset: number,
	newOffset: number,
	baseDetachStarts: readonly number[],
	newAttachStarts: readonly number[],
):
	| { reusedPiece: MarkTree<Mark>; restBase: MarkTree<Mark>; restNew: MarkTree<Mark>; consumed: number }
	| undefined {
	const baseIsNoOp = isPureNoOp(baseMark);
	const newIsNoOp = isPureNoOp(newMark);
	if (!baseIsNoOp && !newIsNoOp) {
		return undefined;
	}

	// If base is the no-op, we're reusing new's stretch (and vice versa).
	const reuseNew = baseIsNoOp;
	const reusedMark = reuseNew ? newMark : baseMark;

	// The mark *currently* sitting at the reused side's read position can
	// itself be settle-sensitive or move-effect-related - unlike a genuine
	// attach/detach (excluded by the outer branch condition that gates every
	// call into `tryBulkSkip`), neither property is excluded by that gate,
	// so it can be true of the very first mark of the run, not just of one
	// appearing further in. This can't be caught by `newAttachStarts`/
	// `baseDetachStarts` below: those record where a hazardous mark *starts*
	// in the *original* flat changeset, which only helps for a hazard
	// starting fresh *after* the current offset - the reused side's read
	// position can already have landed in the *middle* of a hazardous
	// mark's original span (e.g. one long `pin` covering several cells,
	// most of which were already consumed by earlier, unrelated pairings on
	// the *other* side) with no fresh "start" recorded anywhere at or after
	// it. Checking the actual current mark (already correctly sliced to
	// wherever reading stopped) handles that regardless of how it was
	// reached.
	if (isSettleSensitive(reusedMark) || isMoveEffectRelated(reusedMark)) {
		return undefined;
	}

	const noOpLength = baseIsNoOp ? baseMark.count : newMark.count;
	let available = Math.min(remainingBase.totalCount, remainingNew.totalCount, noOpLength);

	const boundary = reuseNew
		? firstBoundaryAtOrAfter(newAttachStarts, newOffset)
		: firstBoundaryAtOrAfter(baseDetachStarts, baseOffset);
	const reusedOffset = reuseNew ? newOffset : baseOffset;
	available = Math.min(available, boundary - reusedOffset);
	if (available <= 0) {
		return undefined;
	}

	const [baseP, restBase] = remainingBase.splitAt(available);
	const [newP, restNew] = remainingNew.splitAt(available);
	return { reusedPiece: reuseNew ? newP : baseP, restBase, restNew, consumed: available };
}
