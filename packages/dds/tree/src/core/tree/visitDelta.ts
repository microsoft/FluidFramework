/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "../../util";
import { FieldKey, Value } from "./types";
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
 * - Performs inserts in the first pass
 *
 * - Does not perform move-ins in the first pass
 *
 * - Skips the second pass if no move-outs were encountered in the first pass
 *
 * - Does not leverage the move table
 *
 * Future work:
 *
 * - Allow the visitor to ignore changes to regions of the tree that are not of interest to it (for partial checkouts).
 *
 * - Leverage move table when it gets added to Delta
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that deletes the first and third node of a field, the visitor calls
 * will pass indices 0 and 1 respectively.
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(delta: Delta.Root, visitor: DeltaVisitor): void {
	const containsMoves = visitFieldMarks(delta, visitor, firstPass);
	if (containsMoves) {
		visitFieldMarks(delta, visitor, secondPass);
	}
}

export interface DeltaVisitor {
	onDelete(index: number, count: number): void;
	onInsert(index: number, content: readonly Delta.ProtoNode[]): void;
	onMoveOut(index: number, count: number, id: Delta.MoveId): void;
	onMoveIn(index: number, count: number, id: Delta.MoveId): void;
	onSetValue(value: Value): void;
	// TODO: better align this with ITreeCursor:
	// maybe rename its up and down to enter / exit? Maybe Also)?
	// Maybe also have cursor have "current field key" state to allow better handling of empty fields and better match
	// this visitor?
	enterNode(index: number): void;
	exitNode(index: number): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

type Pass = (delta: Delta.FieldChanges, visitor: DeltaVisitor) => boolean;

interface ModifyLike {
	setValue?: Value;
	fields?: Delta.FieldChangeMap;
}

function visitFieldMarks(fields: Delta.FieldChangeMap, visitor: DeltaVisitor, func: Pass): boolean {
	let containsMoves = false;
	for (const [key, field] of fields) {
		visitor.enterField(key);
		const result = func(field, visitor);
		containsMoves ||= result;
		visitor.exitField(key);
	}
	return containsMoves;
}

function visitModify(
	index: number,
	modify: ModifyLike,
	visitor: DeltaVisitor,
	func: Pass,
): boolean {
	let containsMoves = false;
	visitor.enterNode(index);
	// Note that the `in` operator return true for properties that are present on the object even if they
	// are set to `undefined. This is leveraged here to represent the fact that the value should be set to
	// `undefined` as opposed to leaving the value untouched.
	if ("setValue" in modify) {
		visitor.onSetValue(modify.setValue);
	}
	if (modify.fields !== undefined) {
		const result = visitFieldMarks(modify.fields, visitor, func);
		containsMoves ||= result;
	}
	visitor.exitNode(index);
	return containsMoves;
}

function firstPass(delta: Delta.FieldChanges, visitor: DeltaVisitor): boolean {
	let containsMoves = false;

	for (const nodeChange of delta.beforeShallow ?? []) {
		const result = visitModify(nodeChange.index, nodeChange, visitor, firstPass);
		containsMoves ||= result;
	}

	const moveInGaps: { readonly index: number; readonly cumulCount: number }[] = [];
	const shallow = delta.shallow ?? [];
	let index = 0;
	for (const mark of shallow) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
		} else {
			// Inline into `switch(mark.type)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case Delta.MarkType.Delete:
					visitor.onDelete(index, mark.count);
					break;
				case Delta.MarkType.MoveOut:
					visitor.onMoveOut(index, mark.count, mark.moveId);
					break;
				case Delta.MarkType.Insert:
					visitor.onInsert(index, mark.content);
					index += mark.content.length;
					break;
				case Delta.MarkType.MoveIn: {
					// Handled in the second pass
					containsMoves = true;
					const prevCount =
						moveInGaps.length === 0 ? 0 : moveInGaps[moveInGaps.length - 1].cumulCount;
					moveInGaps.push({
						index: index + prevCount,
						cumulCount: prevCount + mark.count,
					});
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}

	// While processing the `afterShallow` we have to translate each `NestedChange.index` into the corresponding
	// index for the visitor. Those are not the same because the first pass doesn't apply move-in shallow changes.
	// While processing the shallow changes, the `moveInGaps` array gets populated with the relevant offsets for us
	// to make this index adjustment below.
	let iMoveInGap = 0;
	let missingMoveIns = 0;
	for (const nodeChange of delta.afterShallow ?? []) {
		while (iMoveInGap < moveInGaps.length && nodeChange.index > moveInGaps[iMoveInGap].index) {
			missingMoveIns = moveInGaps[iMoveInGap].cumulCount;
			iMoveInGap += 1;
		}
		const result = visitModify(
			nodeChange.index - missingMoveIns,
			nodeChange,
			visitor,
			firstPass,
		);
		containsMoves ||= result;
	}
	return containsMoves;
}

function secondPass(delta: Delta.FieldChanges, visitor: DeltaVisitor): boolean {
	const processBeforeChanges = (() => {
		const before: readonly Delta.NestedChange[] = delta.beforeShallow ?? [];
		let iNested = 0;
		return (visit: boolean, maxIndex: number): void => {
			while (iNested < before.length && before[iNested].index < maxIndex) {
				if (visit) {
					const adjustedIndex = index - (inputContextIndex - before[iNested].index);
					visitModify(adjustedIndex, before[iNested], visitor, secondPass);
				}
				iNested += 1;
			}
		};
	})();
	const after: readonly Delta.NestedChange[] = delta.afterShallow ?? [];
	let inputContextIndex = 0;
	let index = 0;
	const shallow = delta.shallow ?? [];
	for (const mark of shallow) {
		if (typeof mark === "number") {
			// Untouched nodes
			index += mark;
			inputContextIndex += mark;
			processBeforeChanges(true, inputContextIndex);
		} else {
			// Inline into the `switch(...)` once we upgrade to TS 4.7
			const type = mark.type;
			switch (type) {
				case Delta.MarkType.Delete:
				case Delta.MarkType.MoveOut:
					// Handled in the first pass
					inputContextIndex += mark.count;
					processBeforeChanges(false, inputContextIndex);
					break;
				case Delta.MarkType.Insert:
					// Handled in the first pass
					index += mark.content.length;
					break;
				case Delta.MarkType.MoveIn: {
					visitor.onMoveIn(index, mark.count, mark.moveId);
					index += mark.count;
					break;
				}
				default:
					unreachableCase(type);
			}
		}
	}
	processBeforeChanges(true, Number.POSITIVE_INFINITY);
	for (const nodeChange of after) {
		visitModify(nodeChange.index, nodeChange, visitor, secondPass);
	}
	return false;
}
