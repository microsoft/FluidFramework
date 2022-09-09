/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../../util";
import { Skip, Transposed as T } from "./format";

export function isAttach(mark: T.Mark): mark is T.Attach {
    return isObjMark(mark)
        && "type" in mark
        && (
            mark.type === "Insert"
            || mark.type === "MInsert"
            || mark.type === "MoveIn"
            || mark.type === "MMoveIn"
            || mark.type === "Bounce"
            || mark.type === "Intake"
        )
    ;
}

export function isReattach(mark: T.Mark): mark is T.Reattach | T.ModifyReattach {
    return isObjMark(mark)
        && "type" in mark
        && (
            mark.type === "Revive"
            || mark.type === "MRevive"
            || mark.type === "Return"
            || mark.type === "MReturn"
        )
    ;
}

export function isTomb(mark: T.Mark): mark is T.Tomb {
    return isObjMark(mark) && "type" in mark && mark.type === "Tomb";
}

export function isGapEffectMark(mark: T.Mark): mark is T.GapEffectSegment {
    return isObjMark(mark) && "type" in mark && mark.type === "Gap";
}

export function getAttachLength(attach: T.Attach): number {
    const type = attach.type;
    switch (type) {
        case "Bounce":
        case "Intake":
            return 0;
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
 * @returns `true` iff `lhs` and `rhs` are deeply structurally equal.
 */
export function isEqualGaps(lhs: T.GapEffect[] | undefined, rhs: T.GapEffect[] | undefined): boolean {
    if (lhs === rhs) {
        return true;
    }
    if (lhs === undefined || rhs === undefined || lhs.length !== rhs.length) {
        return false;
    }
    for (let i = 0; i < lhs.length; ++i) {
        if (!isEqualGapEffect(lhs[i], rhs[i])) {
            return false;
        }
    }
    return true;
}

/**
 * @returns `true` iff `lhs` and `rhs`'s `HasPlaceFields` fields are structurally equal.
 */
export function isEqualPlace(lhs: Readonly<T.HasPlaceFields>, rhs: Readonly<T.HasPlaceFields>): boolean {
    return lhs.heed === rhs.heed
    && lhs.tiebreak === rhs.tiebreak
    && lhs.src?.id === rhs.src?.id
    && lhs.src?.change === rhs.src?.change
    && lhs.scorch?.id === rhs.scorch?.id
    && lhs.scorch?.change === rhs.scorch?.change;
}

export function isEqualGapEffect(lhs: Readonly<T.GapEffect>, rhs: Readonly<T.GapEffect>): boolean {
    return lhs.id === rhs.id
        && lhs.type === rhs.type
        && lhs.excludePriorInsertions === rhs.excludePriorInsertions
        && lhs.includePosteriorInsertions === rhs.includePosteriorInsertions;
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: T.Mark): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    const type = mark.type;
    switch (type) {
        case "Tomb":
        case "Gap":
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
        case "Intake":
        case "Bounce":
            return 0;
        default: unreachableCase(type);
    }
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: T.Mark): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    if (isAttach(mark)) {
        return 0;
    }
    const type = mark.type;
    switch (type) {
        case "Tomb":
        case "Gap":
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

export function isSkipMark(mark: T.Mark): mark is Skip {
    return typeof mark === "number";
}

/**
 * Splits the `mark` into two marks such that the first returned mark has input length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMarkOnInput<TMark extends T.SizedMark>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getInputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    // The compiler seems to think the case below is necessary
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const markObj = mark as T.SizedObjectMark;
    const type = markObj.type;
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
        case "Gap":
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
export function splitMarkOnOutput<TMark extends T.Mark>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getOutputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as T.ObjectMark;
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
        case "Bounce":
        case "Intake":
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
        case "Gap":
            return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
        default: unreachableCase(type);
    }
}

export function isDetachMark(mark: T.Mark | undefined): mark is T.Detach | T.ModifyDetach {
    if (isObjMark(mark) && "type" in mark) {
        const type = mark.type;
        return type === "Delete" || type === "MDelete" || type === "MoveOut" || type === "MMoveOut";
    }
    return false;
}

export function isObjMark(mark: T.Mark | undefined): mark is T.ObjectMark {
    return typeof mark === "object";
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(lhs: T.ObjectMark, rhs: Readonly<T.ObjectMark>): boolean {
    if (rhs.type !== lhs.type) {
        return false;
    }
    const type = rhs.type;
    switch (type) {
        case "Insert":
        case "MoveIn": {
            const lhsAttach = lhs as T.Insert | T.MoveIn;
            if (rhs.id === lhsAttach.id ?? isEqualPlace(lhsAttach, rhs)) {
                if (rhs.type === "Insert") {
                    const lhsInsert = lhsAttach as T.Insert;
                    lhsInsert.content.push(...rhs.content);
                } else {
                    const lhsMoveIn = lhsAttach as T.MoveIn;
                    lhsMoveIn.count += rhs.count;
                }
                return true;
            }
            break;
        }
        case "Delete":
        case "MoveOut": {
            const lhsDetach = lhs as T.Detach;
            if (
                rhs.id === lhsDetach.id
                && rhs.tomb === lhsDetach.tomb
                && isEqualGaps(rhs.gaps, lhsDetach.gaps)
            ) {
                lhsDetach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Revive":
        case "Return": {
            const lhsReattach = lhs as T.Reattach;
            if (
                rhs.id === lhsReattach.id
                && rhs.tomb === lhsReattach.tomb
            ) {
                lhsReattach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Gap": {
            const lhsGap = lhs as T.GapEffectSegment;
            if (
                rhs.tomb === lhsGap.tomb
                && isEqualGaps(rhs.stack, lhsGap.stack)
            ) {
                lhsGap.count += rhs.count;
                return true;
            }
            break;
        }
        case "Tomb": {
            const lhsTomb = lhs as T.Tomb;
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
