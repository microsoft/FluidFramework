/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, neverCase } from "../util";
import { Delta } from "./delta";

/**
 * Because visitors are based on describing changes at some location in the tree (with the exception of "build"),
 * we want to ensure that visitors visit changes in an order that guarantees all changes are describable in terms
 * of some position in the tree. This means that we need to detach content bottom-up and attach content top-down.
 * Note that while the attach positions are expressed top-down, there is still a bottom-up spirit to building trees
 * that are being inserted.
 *
 * The second challenge, is that of the inability of the visitor to move-in content that has yet to be moved-out.
 * This leads to a two-pass algorithm, but there are two degrees for freedom to consider:
 * 1) Whether inserts should be performed in the first pass whenever possible (some are not: inserts below a move-ins
 *   for which we have not yet seen the matching move-out).
 * Pros: The path above the insertion point is walked once instead of twice
 * Cons: The paths within the inserted content risk being walked twice instead of once (once for building the content,
 * once for traversing the tree to reach move-in marks in the second phase).
 *
 * 2) Whether move-ins for which we have the move-out content should be performed in the first pass.
 * Pros: The path above the move-in point is walked once instead of twice
 * Cons: We now have to record which of the move-ins we did not perform in the first pass. We could build a trie of
 * those to reduce the amount of sifting we have to do on the second pass.
 *
 * The presence of a move table, which lists the src and dst paths for each move, could be leveraged to make some of
 * these option more efficient:
 * - If inserts are allowed in the first pass and move-ins are not allowed in the first pass, then the move table
 *   describes exactly which parts of the delta need applying in the second pass.
 * - If inserts and move-ins are allowed in the first pass then having a boolean flag for each entry in the move table
 *   that describes whether the move has been attached, or having a set for that describes which entries remain, would
 *   describe which parts of the delta  need applying in the second pass.
 *
 * Future work:
 * - Take a path to the subtree of interest (or some other description of the regions of interest)
*/
export function visitDelta(delta: Delta.Root, visitor: DeltaVisitor): void {
	const moveInfo: MoveOutInfo = new Map();
	firstPass(delta, { visitor, moveInfo });
	if (moveInfo.size > 0) {
		secondPass(delta, { visitor, moveInfo });
	}
}

type MoveOutInfo = Map<Delta.MoveId, Delta.MoveOut>;

interface PassProps {
	/**
	 * Can be omitted if equal to zero.
	 */
	startIndex?: number;
	visitor: DeltaVisitor;
	moveInfo: MoveOutInfo;
}

type Pass = (delta: Delta.Root, props: PassProps) => void;

function recurse(modify: Delta.Modify, props: PassProps, func: Pass): void {
	// Note that the `in` operator return true for properties that are present on the object even if they
	// are set to `undefined. This is leveraged here to represent the fact that the value should be set to
	// `undefined` as opposed to leaving the value untouched.
	if (Delta.setValue in modify) {
		props.visitor.onSetValue(modify[Delta.setValue]);
	}
	// `Object.keys`'s return value does not include symbols
	for (const key of Object.keys(modify)) {
		props.visitor.enterField(key);
		func(modify[key], props);
		props.visitor.exitField(key);
	}
}

function firstPass(delta: Delta.Root, props: PassProps): void {
	const { startIndex, visitor, moveInfo } = props;
	let index = startIndex ?? 0;
	for (const { offset, mark } of delta) {
		index += offset;
		// Inline into the `switch(...)` once we upgrade to TS 4.7
		const type = mark[Delta.type];
		switch (type) {
			case Delta.MarkType.Delete: {
				// Remove cast once we upgrade to TS 4.7
				const deleteMark = mark as Delta.Delete;
				if (mark.modify !== undefined) {
					firstPass(mark.modify, { ...props, startIndex: index });
				}
				visitor.onDelete(index, deleteMark);
				break;
			}
			case Delta.MarkType.MoveOut: {
				// Remove cast once we upgrade to TS 4.7
				const moveOutMark = mark as Delta.MoveOut;
				moveInfo.set(moveOutMark.moveId, moveOutMark);
				if (mark.modify !== undefined) {
					firstPass(mark.modify, { ...props, startIndex: index });
				}
				visitor.onMoveOut(index, moveOutMark);
				break;
			}
			case Delta.MarkType.Modify: {
				// Remove cast once we upgrade to TS 4.7
				const modifyMark = mark as Delta.Modify;
				visitor.enterNode(index);
				recurse(modifyMark, { visitor, moveInfo }, firstPass);
				visitor.exitNode(index);
				index += 1;
				break;
			}
			case Delta.MarkType.Insert: {
				// Remove cast once we upgrade to TS 4.7
				const insertMark = mark as Delta.Insert;
				visitor.onInsert(index, insertMark);
				if (mark.modify !== undefined) {
					firstPass(mark.modify, { ...props, startIndex: index });
				}
				index += insertMark.content.length;
				break;
			}
			case Delta.MarkType.MoveIn: {
				// Handled in the second pass
				break;
			}
			default: neverCase(type);
		}
	}
}

const NO_MATCHING_MOVE_OUT_ERR = "Encountered a MoveIn mark for which there is not corresponding MoveOut mark";

function secondPass(delta: Delta.Root, props: PassProps): void {
	const { startIndex, visitor, moveInfo } = props;
	let index = startIndex ?? 0;
	for (const { offset, mark } of delta) {
		index += offset;
		// Inline into the `switch(...)` once we upgrade to TS 4.7
		const type = mark[Delta.type];
		switch (type) {
			case Delta.MarkType.Delete: {
				// Handled in the first pass
				break;
			}
			case Delta.MarkType.MoveOut: {
				// Handled in the first pass
				break;
			}
			case Delta.MarkType.Modify: {
				// Remove cast once we upgrade to TS 4.7
				const modifyMark = mark as Delta.Modify;
				visitor.enterNode(index);
				recurse(modifyMark, { ...props, startIndex: 0 }, secondPass);
				visitor.exitNode(index);
				index += 1;
				break;
			}
			case Delta.MarkType.Insert: {
				// Remove cast once we upgrade to TS 4.7
				const insertMark = mark as Delta.Insert;
				// Handled in the first pass
				index += insertMark.content.length;
				break;
			}
			case Delta.MarkType.MoveIn: {
				// Remove cast once we upgrade to TS 4.7
				const moveInMark = mark as Delta.MoveIn;
				visitor.onMoveIn(index, moveInMark);
				if (mark.modify !== undefined) {
					// Note that this may call visitor callbacks with an index that is less than index + moveOut.count
					secondPass(mark.modify, { ...props, startIndex: index });
				}
				const moveOut = moveInfo.get(moveInMark.moveId) ?? fail(NO_MATCHING_MOVE_OUT_ERR);
				index += moveOut.count;
				break;
			}
			default: neverCase(type);
		}
	}
}

export interface DeltaVisitor {
	onDelete(index: number, mark: Delta.Delete): void;
	onInsert(index: number, mark: Delta.Insert): void;
	onMoveOut(index: number, mark: Delta.MoveOut): void;
	onMoveIn(index: number, mark: Delta.MoveIn): void;
	onSetValue(value: Delta.Value): void;
	enterNode(index: number): void;
	exitNode(index: number): void;
	enterField(key: Delta.FieldKey): void;
	exitField(key: Delta.FieldKey): void;
}
