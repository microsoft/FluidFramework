/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../util";
import * as F from "./format";

export function isModify<TNodeChange>(mark: F.Mark<TNodeChange>): mark is F.Modify<TNodeChange> {
    return isObjMark(mark) && mark.type === "Modify";
}

export function isAttach<TNodeChange>(mark: F.Mark<TNodeChange>): mark is F.Attach<TNodeChange> {
    return isObjMark(mark)
        && (
            mark.type === "Insert"
            || mark.type === "MInsert"
            || mark.type === "MoveIn"
            || mark.type === "MMoveIn"
        )
    ;
}

export function isReattach<TNodeChange>(mark: F.Mark<TNodeChange>): mark is F.Reattach | F.ModifyReattach<TNodeChange> {
    return isObjMark(mark)
        && (
            mark.type === "Revive"
            || mark.type === "MRevive"
            || mark.type === "Return"
            || mark.type === "MReturn"
        )
    ;
}

export function isTomb(mark: F.Mark<unknown>): mark is F.Tomb {
    return isObjMark(mark) && mark.type === "Tomb";
}

export function getAttachLength(attach: F.Attach): number {
    const type = attach.type;
    switch (type) {
        case "MInsert":
        case "MMoveIn":
            return 1;
        case "Insert":
            return attach.content.length;
        case "MoveIn":
            return attach.count;
        default: unreachableCase(type);
    }
}

/**
 * @returns `true` iff `lhs` and `rhs`'s `HasPlaceFields` fields are structurally equal.
 */
export function isEqualPlace(lhs: Readonly<F.HasPlaceFields>, rhs: Readonly<F.HasPlaceFields>): boolean {
    return lhs.heed === rhs.heed
    && lhs.tiebreak === rhs.tiebreak;
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: F.Mark<unknown>): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    const type = mark.type;
    switch (type) {
        case "Tomb":
        case "Revive":
        case "Return":
        case "MoveIn":
            return mark.count;
        case "Insert":
            return mark.content.length;
        case "MInsert":
        case "MMoveIn":
        case "MReturn":
        case "MRevive":
        case "Modify":
            return 1;
        case "Delete":
        case "MDelete":
        case "MoveOut":
        case "MMoveOut":
            return 0;
        default: unreachableCase(type);
    }
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: F.Mark<unknown>): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    if (isAttach(mark)) {
        return 0;
    }
    const type = mark.type;
    switch (type) {
        case "Tomb":
        case "Revive":
        case "Return":
        case "Delete":
        case "MoveOut":
            return mark.count;
        case "MReturn":
        case "MRevive":
        case "Modify":
        case "MDelete":
        case "MMoveOut":
            return 1;
        default: unreachableCase(type);
    }
}

export function isSkipMark(mark: F.Mark<unknown>): mark is F.Skip {
    return typeof mark === "number";
}

/**
 * Splits the `mark` into two marks such that the first returned mark has input length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMarkOnInput<TMark extends F.SizedMark<unknown>>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getInputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as F.SizedObjectMark;
    const type = mark.type;
    switch (type) {
        case "Modify":
        case "MDelete":
        case "MMoveOut":
        case "MReturn":
        case "MRevive":
            fail(`Unable to split ${type} mark of length 1`);
        case "Delete":
        case "MoveOut":
        case "Return":
        case "Revive":
        case "Tomb":
            return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
        default: unreachableCase(type);
    }
}

/**
 * Splits the `mark` into two marks such that the first returned mark has output length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has output length `length`.
 */
export function splitMarkOnOutput<TMark extends F.Mark<unknown>>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getOutputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as F.ObjectMark;
    const type = markObj.type;
    switch (type) {
        case "Modify":
        case "MReturn":
        case "MRevive":
        case "MInsert":
        case "MMoveIn":
            fail(`Unable to split ${type} mark of length 1`);
        case "MDelete":
        case "MMoveOut":
        case "Delete":
        case "MoveOut":
            fail(`Unable to split ${type} mark of length 0`);
        case "Insert":
            return [
                { ...markObj, content: markObj.content.slice(0, length) },
                { ...markObj, content: markObj.content.slice(length) },
            ] as [TMark, TMark];
        case "MoveIn":
        case "Return":
        case "Revive":
        case "Tomb":
            return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
        default: unreachableCase(type);
    }
}

export function isDetachMark<TNodeChange>(
    mark: F.Mark<TNodeChange> | undefined,
): mark is F.Detach | F.ModifyDetach<TNodeChange> {
    if (isObjMark(mark)) {
        const type = mark.type;
        return type === "Delete" || type === "MDelete" || type === "MoveOut" || type === "MMoveOut";
    }
    return false;
}

export function isObjMark<TNodeChange>(mark: F.Mark<TNodeChange> | undefined): mark is F.ObjectMark<TNodeChange> {
    return typeof mark === "object";
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(lhs: F.ObjectMark, rhs: Readonly<F.ObjectMark>): boolean {
    if (rhs.type !== lhs.type) {
        return false;
    }
    const type = rhs.type;
    switch (type) {
        case "Insert":
        case "MoveIn": {
            const lhsAttach = lhs as F.Insert | F.MoveIn;
            if (rhs.id === lhsAttach.id ?? isEqualPlace(lhsAttach, rhs)) {
                if (rhs.type === "Insert") {
                    const lhsInsert = lhsAttach as F.Insert;
                    lhsInsert.content.push(...rhs.content);
                } else {
                    const lhsMoveIn = lhsAttach as F.MoveIn;
                    lhsMoveIn.count += rhs.count;
                }
                return true;
            }
            break;
        }
        case "Delete":
        case "MoveOut": {
            const lhsDetach = lhs as F.Detach;
            if (
                rhs.id === lhsDetach.id
                && rhs.tomb === lhsDetach.tomb
            ) {
                lhsDetach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Revive":
        case "Return": {
            const lhsReattach = lhs as F.Reattach;
            if (
                rhs.id === lhsReattach.id
                && rhs.tomb === lhsReattach.tomb
            ) {
                lhsReattach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Tomb": {
            const lhsTomb = lhs as F.Tomb;
            if (rhs.change === lhsTomb.change) {
                lhsTomb.count += rhs.count;
                return true;
            }
            break;
        }
        default: break;
    }
    return false;
}
