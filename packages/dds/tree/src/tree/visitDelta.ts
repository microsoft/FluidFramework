/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "../util";
import { FieldKey, Value } from "./types";
import * as Delta from "./delta";

/**
 * Implementation notes:
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
 * Current implementation:
 * - Performs inserts in the first pass
 * - Does not perform move-ins in the first pass
 * - Skips the second pass if no move-outs were encountered in the first pass
 * - Does not leverage the move table
 *
 * Future work:
 * - Allow the visitor to ignore changes to regions of the tree that are not of interest to it (for partial checkouts).
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
    const moveInfo: MoveOutInfo = new Map();
    const props = { visitor, moveInfo };
    visitFieldMarks(delta, props, firstPass);
    if (moveInfo.size > 0) {
        visitFieldMarks(delta, props, secondPass);
    }
}

export interface DeltaVisitor {
    onDelete(index: number, count: number): void;
    onInsert(index: number, content: Delta.ProtoNode[]): void;
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

type MoveOutInfo = Map<Delta.MoveId, Delta.MoveOut>;

interface PassProps {
    /**
     * Can be omitted if equal to zero.
     */
    startIndex?: number;
    visitor: DeltaVisitor;
    moveInfo: MoveOutInfo;
}

type Pass = (delta: Delta.MarkList, props: PassProps) => void;

interface ModifyLike {
    setValue?: Value;
    fields?: Delta.FieldMarks<Delta.Mark>;
}

function visitFieldMarks(fields: Delta.FieldMarks<Delta.Mark>, props: PassProps, func: Pass): void {
    for (const [key, field] of fields) {
        props.visitor.enterField(key);
        func(field, { ...props, startIndex: 0 });
        props.visitor.exitField(key);
    }
}

function visitModify(modify: ModifyLike, props: PassProps, func: Pass): void {
    const { startIndex, visitor } = props;
    visitor.enterNode(startIndex ?? 0);
    // Note that the `in` operator return true for properties that are present on the object even if they
    // are set to `undefined. This is leveraged here to represent the fact that the value should be set to
    // `undefined` as opposed to leaving the value untouched.
    if ("setValue" in modify) {
        visitor.onSetValue(modify.setValue);
    }
    if (modify.fields !== undefined) {
        visitFieldMarks(modify.fields, props, func);
    }
    visitor.exitNode(startIndex ?? 0);
}

function firstPass(delta: Delta.MarkList, props: PassProps): void {
    const { startIndex, visitor, moveInfo } = props;
    let index = startIndex ?? 0;
    for (const mark of delta) {
        if (typeof mark === "number") {
            // Untouched nodes
            index += mark;
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case Delta.MarkType.ModifyAndDelete:
                    visitModify(mark, { ...props, startIndex: index }, firstPass);
                    visitor.onDelete(index, 1);
                    break;
                case Delta.MarkType.Delete:
                    visitor.onDelete(index, mark.count);
                    break;
                case Delta.MarkType.ModifyAndMoveOut:
                    visitModify(mark, { ...props, startIndex: index }, firstPass);
                    visitor.onMoveOut(index, 1, mark.moveId);
                    break;
                case Delta.MarkType.MoveOut:
                    moveInfo.set(mark.moveId, mark);
                    visitor.onMoveOut(index, mark.count, mark.moveId);
                    break;
                case Delta.MarkType.Modify:
                    visitModify(mark, { ...props, startIndex: index }, firstPass);
                    index += 1;
                    break;
                case Delta.MarkType.Insert:
                    visitor.onInsert(index, mark.content);
                    index += mark.content.length;
                    break;
                case Delta.MarkType.InsertAndModify:
                    visitor.onInsert(index, [mark.content]);
                    visitModify(mark, { ...props, startIndex: index }, firstPass);
                    index += 1;
                    break;
                case Delta.MarkType.MoveIn:
                case Delta.MarkType.MoveInAndModify:
                    // Handled in the second pass
                    break;
                default: unreachableCase(type);
            }
        }
    }
}

const NO_MATCHING_MOVE_OUT_ERR = "Encountered a MoveIn mark for which there is not corresponding MoveOut mark";

function secondPass(delta: Delta.MarkList, props: PassProps): void {
    const { startIndex, visitor, moveInfo } = props;
    let index = startIndex ?? 0;
    for (const mark of delta) {
        if (typeof mark === "number") {
            // Untouched nodes
            index += mark;
        } else {
            // Inline into the `switch(...)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case Delta.MarkType.ModifyAndDelete:
                case Delta.MarkType.ModifyAndMoveOut:
                case Delta.MarkType.Delete:
                case Delta.MarkType.MoveOut:
                    // Handled in the first pass
                    break;
                case Delta.MarkType.Modify:
                    visitModify(mark, { ...props, startIndex: index }, secondPass);
                    index += 1;
                    break;
                case Delta.MarkType.Insert:
                    // Handled in the first pass
                    index += mark.content.length;
                    break;
                case Delta.MarkType.InsertAndModify:
                    // Handled in the first pass
                    index += 1;
                    break;
                case Delta.MarkType.MoveIn: {
                    const moveOut = moveInfo.get(mark.moveId) ?? fail(NO_MATCHING_MOVE_OUT_ERR);
                    visitor.onMoveIn(index, moveOut.count, moveOut.moveId);
                    index += moveOut.count;
                    break;
                }
                case Delta.MarkType.MoveInAndModify:
                    if (!moveInfo.has(mark.moveId)) {
                        fail(NO_MATCHING_MOVE_OUT_ERR);
                    }
                    visitor.onMoveIn(index, 1, mark.moveId);
                    visitModify(mark, { ...props, startIndex: index }, secondPass);
                    index += 1;
                    break;
                default: unreachableCase(type);
            }
        }
    }
}
