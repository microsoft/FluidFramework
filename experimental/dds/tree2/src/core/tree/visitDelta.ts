/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	RangeMap,
	brand,
	extractFromOpaque,
	getFirstFromRangeMap,
	setInRangeMap,
} from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";

/**
 * Implementation notes:
 *
 * Because visitors are based on describing changes at some location in the tree (with the exception of "build"),
 * we want to ensure that visitors visit changes in an order that guarantees all changes are describable in terms
 * of some position in the tree. This means that we need to detach content bottom-up and attach content top-down.
 * Note that while the attach positions are expressed top-down, there is still a bottom-up spirit to building trees
 * that are being inserted.
 *
 * The second challenge, is that of the inability of the visitor to move-in content that has yet to be moved-out.
 * This leads to a two-pass algorithm, but there are two degrees for freedom to consider:
 *
 * 1. Whether inserts should be performed in the first pass whenever possible (some are not: inserts below a move-ins
 * for which we have not yet seen the matching move-out).
 * Pros: The path above the insertion point is walked once instead of twice
 * Cons: The paths within the inserted content risk being walked twice instead of once (once for building the content,
 * once for traversing the tree to reach move-in marks in the second phase).
 *
 * 2. Whether move-ins for which we have the move-out content should be performed in the first pass.
 * Pros: The path above the move-in point is walked once instead of twice
 * Cons: We now have to record which of the move-ins we did not perform in the first pass. We could build a trie of
 * those to reduce the amount of sifting we have to do on the second pass.
 *
 * The presence of a move table, which lists the src and dst paths for each move, could be leveraged to make some of
 * these option more efficient:
 *
 * - If inserts are allowed in the first pass and move-ins are not allowed in the first pass, then the move table
 * describes exactly which parts of the delta need applying in the second pass.
 *
 * - If inserts and move-ins are allowed in the first pass then having a boolean flag for each entry in the move table
 * that describes whether the move has been attached, or having a set for that describes which entries remain, would
 * describe which parts of the delta  need applying in the second pass.
 *
 * Current implementation:
 *
 * - First pass: performs inserts top-down and move-outs bottom-up (it also performs value updates)
 *
 * - Second pass: performs move-ins top-down and deletes bottom-up
 *
 * - Skips the second pass if no moves or deletes were encountered in the first pass
 *
 * Future work:
 *
 * - Allow the visitor to ignore changes to regions of the tree that are not of interest to it (for partial views).
 *
 * - Avoid moving the visitor through parts of the document that do not need changing in the current pass.
 * This could be done by assigning IDs to nodes of interest and asking the visitor to jump to these nodes in order to edit them.
 *
 * - Leverage the move table if one ever gets added to Delta
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that deletes the first and third node of a field, the visitor calls
 * will pass indices 0 and 1 respectively.
 *
 * Note a node may be moved more than once while visiting a delta.
 * This is because the delta may move-out a single block of adjacent nodes which are not all moved to the same destination.
 * To avoid the need for the visitor to support moving-in a subrange of a moved-out block, this function will instead
 * move-in the entire block and then move-out the unused portions with new move IDs.
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(delta: Delta.Root, visitor: DeltaVisitor): void {
	const modsToMovedTrees = new Map<Delta.MoveId, Delta.HasModifications>();
	const movedOutNodes: RangeMap<Delta.MoveId> = [];
	const containsMovesOrDeletes = visitFieldMarks(delta, visitor, {
		func: firstPass,
		applyValueChanges: true,
		modsToMovedTrees,
		movedOutRanges: movedOutNodes,
	});
	if (containsMovesOrDeletes) {
		visitFieldMarks(delta, visitor, {
			func: secondPass,
			applyValueChanges: false,
			modsToMovedTrees,
			movedOutRanges: movedOutNodes,
		});
	}
}

export function applyDelta(
	delta: Delta.Root,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(delta, visitor);
	visitor.free();
}
/**
 * Visitor for changes in a delta.
 * Must be freed after use.
 * @public
 */
export interface DeltaVisitor {
	free(): void;
	onDelete(index: number, count: number): void;
	onInsert(index: number, content: Delta.ProtoNodes): void;
	onMoveOut(index: number, count: number, id: Delta.MoveId): void;
	onMoveIn(index: number, count: number, id: Delta.MoveId): void;
	enterNode(index: number): void;
	exitNode(index: number): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly func: Pass;
	readonly applyValueChanges: boolean;

	readonly modsToMovedTrees: Map<Delta.MoveId, Delta.HasModifications>;
	readonly movedOutRanges: RangeMap<Delta.MoveId>;
}

type Pass = (delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig) => boolean;

function visitFieldMarks(
	fields: Delta.FieldMarks,
	visitor: DeltaVisitor,
	config: PassConfig,
): boolean {
	let containsMovesOrDeletes = false;
	for (const [key, field] of fields) {
		visitor.enterField(key);
		const result = config.func(field, visitor, config);
		containsMovesOrDeletes ||= result;
		visitor.exitField(key);
	}
	return containsMovesOrDeletes;
}

function visitModify(
	index: number,
	modify: Delta.HasModifications,
	visitor: DeltaVisitor,
	config: PassConfig,
): boolean {
	let containsMovesOrDeletes = false;

	if (modify.fields !== undefined) {
		visitor.enterNode(index);
		if (modify.fields !== undefined) {
			const result = visitFieldMarks(modify.fields, visitor, config);
			containsMovesOrDeletes ||= result;
		}
		visitor.exitNode(index);
	}
	return containsMovesOrDeletes;
}

function firstPass(delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig): boolean {
	let listHasMoveOrDelete = false;
	let index = 0;
	for (const mark of delta) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
		} else {
			let markHasMoveOrDelete = false;
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case Delta.MarkType.Delete:
					// Handled in the second pass
					visitModify(index, mark, visitor, config);
					index += mark.count;
					markHasMoveOrDelete = true;
					break;
				case Delta.MarkType.MoveOut:
					markHasMoveOrDelete = visitModify(index, mark, visitor, config);
					if (markHasMoveOrDelete) {
						config.modsToMovedTrees.set(mark.moveId, mark);
					}
					visitor.onMoveOut(index, mark.count, mark.moveId);
					setInRangeMap(
						config.movedOutRanges,
						extractFromOpaque(mark.moveId),
						mark.count,
						mark.moveId,
					);
					break;
				case Delta.MarkType.Modify:
					markHasMoveOrDelete = visitModify(index, mark, visitor, config);
					index += 1;
					break;
				case Delta.MarkType.Insert:
					visitor.onInsert(index, mark.content);
					markHasMoveOrDelete =
						visitModify(index, mark, visitor, config) || (mark.isTransient ?? false);
					index += mark.content.length;
					break;
				case Delta.MarkType.MoveIn:
					// Handled in the second pass
					markHasMoveOrDelete = true;
					break;
				default:
					unreachableCase(type);
			}
			listHasMoveOrDelete ||= markHasMoveOrDelete;
		}
	}
	return listHasMoveOrDelete;
}

function secondPass(delta: Delta.MarkList, visitor: DeltaVisitor, config: PassConfig): boolean {
	let index = 0;
	for (const mark of delta) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
		} else {
			// Inline into the `switch(...)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case Delta.MarkType.Delete:
					visitModify(index, mark, visitor, config);
					visitor.onDelete(index, mark.count);
					break;
				case Delta.MarkType.MoveOut:
					// Handled in the first pass
					break;
				case Delta.MarkType.Modify:
					visitModify(index, mark, visitor, config);
					index += 1;
					break;
				case Delta.MarkType.Insert:
					visitModify(index, mark, visitor, config);
					if (mark.isTransient ?? false) {
						visitor.onDelete(index, mark.content.length);
					} else {
						index += mark.content.length;
					}
					break;
				case Delta.MarkType.MoveIn: {
					let entry = getFirstFromRangeMap(
						config.movedOutRanges,
						extractFromOpaque(mark.moveId),
						mark.count,
					);
					assert(entry !== undefined, 0x6d7 /* Expected a move out for this move in */);
					visitor.onMoveIn(index, entry.length, entry.value);
					let endIndex = index + entry.length;

					const lengthBeforeMark = extractFromOpaque(mark.moveId) - entry.start;
					if (lengthBeforeMark > 0) {
						visitor.onMoveOut(index, lengthBeforeMark, entry.value);
						endIndex -= lengthBeforeMark;
						setInRangeMap(
							config.movedOutRanges,
							entry.start,
							lengthBeforeMark,
							entry.value,
						);
					}

					const lastMarkId = (extractFromOpaque(mark.moveId) as number) + mark.count - 1;
					let lastEntryId = entry.start + entry.length - 1;
					let lengthAfterEntry = lastMarkId - lastEntryId;
					while (lengthAfterEntry > 0) {
						const nextId = lastEntryId + 1;
						entry = getFirstFromRangeMap(config.movedOutRanges, nextId, mark.count);

						assert(
							entry !== undefined && entry.start === nextId,
							0x6d8 /* Expected a move out for the remaining portion of this move in */,
						);

						lastEntryId = entry.start + entry.length - 1;
						lengthAfterEntry = lastMarkId - lastEntryId;

						visitor.onMoveIn(endIndex, entry.length, brand(entry.start));
						endIndex += entry.length;
					}

					const lengthAfterMark = -lengthAfterEntry;
					if (lengthAfterMark > 0) {
						const nextMoveId: Delta.MoveId = brand(lastMarkId + 1);
						visitor.onMoveOut(endIndex - lengthAfterMark, lengthAfterMark, nextMoveId);
						endIndex -= lengthAfterMark;
						setInRangeMap(
							config.movedOutRanges,
							extractFromOpaque(nextMoveId),
							lengthAfterMark,
							nextMoveId,
						);
					}

					if (mark.count === 1) {
						const modify = config.modsToMovedTrees.get(mark.moveId);
						if (modify !== undefined) {
							visitModify(index, modify, visitor, config);
						}
					}
					index = endIndex;
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}
	return false;
}
