/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import {
    Attach,
    Detach,
    HasChanges,
    HasRevisionTag,
    HasTiebreakPolicy,
    Insert,
    LineageEvent,
    Mark,
    Modify,
    MoveIn,
    MoveOut,
    ObjectMark,
    Reattach,
    ReturnFrom,
    ReturnTo,
    SizedMark,
    Skip,
} from "./format";
import { getOrCreateEffect, MoveEffectTable, MoveEnd, MoveMark } from "./moveEffectTable";

export function isModify<TNodeChange>(mark: Mark<TNodeChange>): mark is Modify<TNodeChange> {
    return isObjMark(mark) && mark.type === "Modify";
}

export function isAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is Attach<TNodeChange> {
    return (
        (isObjMark(mark) && (mark.type === "Insert" || mark.type === "MoveIn")) || isReattach(mark)
    );
}

export function isReattach<TNodeChange>(mark: Mark<TNodeChange>): mark is Reattach<TNodeChange> {
    return isObjMark(mark) && (mark.type === "Revive" || mark.type === "ReturnTo");
}

export function getAttachLength(attach: Attach): number {
    const type = attach.type;
    switch (type) {
        case "Insert":
            return attach.content.length;
        case "MoveIn":
        case "Revive":
        case "ReturnTo":
            return attach.count;
        default:
            unreachableCase(type);
    }
}

/**
 * @returns `true` iff `lhs` and `rhs`'s `HasTiebreakPolicy` fields are structurally equal.
 */
export function isEqualPlace(
    lhs: Readonly<HasTiebreakPolicy>,
    rhs: Readonly<HasTiebreakPolicy>,
): boolean {
    return (
        lhs.heed === rhs.heed &&
        lhs.tiebreak === rhs.tiebreak &&
        areSameLineage(lhs.lineage ?? [], rhs.lineage ?? [])
    );
}

function areSameLineage(lineage1: LineageEvent[], lineage2: LineageEvent[]): boolean {
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
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: Mark<unknown>): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    const type = mark.type;
    switch (type) {
        case "Revive":
        case "ReturnTo":
        case "MoveIn":
            return mark.count;
        case "Insert":
            return mark.content.length;
        case "Modify":
            return 1;
        case "Delete":
        case "MoveOut":
        case "ReturnFrom":
            return 0;
        default:
            unreachableCase(type);
    }
}

/**
 * @param mark - The mark to get the length of.
 * @returns The number of nodes within the input context of the mark.
 */
export function getInputLength(mark: Mark<unknown>): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    if (isAttach(mark)) {
        return 0;
    }
    const type = mark.type;
    switch (type) {
        case "Delete":
        case "MoveOut":
        case "ReturnFrom":
            return mark.count;
        case "Modify":
            return 1;
        default:
            unreachableCase(type);
    }
}

export function isSkipMark(mark: Mark<unknown>): mark is Skip {
    return typeof mark === "number";
}

export function isDetachMark<TNodeChange>(
    mark: Mark<TNodeChange> | undefined,
): mark is Detach<TNodeChange> {
    if (isObjMark(mark)) {
        const type = mark.type;
        return type === "Delete" || type === "MoveOut" || type === "ReturnFrom";
    }
    return false;
}

export function isObjMark<TNodeChange>(
    mark: Mark<TNodeChange> | undefined,
): mark is ObjectMark<TNodeChange> {
    return typeof mark === "object";
}

export function isSizedMark<TNodeChange>(mark: Mark<TNodeChange>): mark is SizedMark<TNodeChange> {
    return isSkipMark(mark) || mark.type === "Modify" || isDetachMark(mark);
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(
    lhs: ObjectMark,
    rhs: Readonly<ObjectMark>,
    moveEffects: MoveEffectTable<unknown> | undefined,
): boolean {
    if (rhs.type !== lhs.type) {
        return false;
    }
    const type = rhs.type;
    if (type !== "Modify" && rhs.revision !== (lhs as HasRevisionTag).revision) {
        return false;
    }

    if (
        (type !== "MoveIn" && type !== "ReturnTo" && rhs.changes !== undefined) ||
        (lhs as Modify | HasChanges).changes !== undefined
    ) {
        return false;
    }

    switch (type) {
        case "Insert": {
            const lhsInsert = lhs as Insert;
            if (isEqualPlace(lhsInsert, rhs)) {
                lhsInsert.content.push(...rhs.content);
                return true;
            }
            break;
        }
        case "MoveIn":
        case "ReturnTo": {
            // TODO: Handle reattach fields
            const lhsMoveIn = lhs as MoveIn | ReturnTo;
            if (
                isEqualPlace(lhsMoveIn, rhs) &&
                moveEffects !== undefined &&
                tryMergeMoves(MoveEnd.Dest, lhsMoveIn, rhs, moveEffects)
            ) {
                return true;
            }
            break;
        }
        case "Delete": {
            const lhsDetach = lhs as Detach;
            lhsDetach.count += rhs.count;
            return true;
        }
        case "MoveOut":
        case "ReturnFrom": {
            // TODO: Handle reattach fields
            const lhsMoveOut = lhs as MoveOut | ReturnFrom;
            if (
                moveEffects !== undefined &&
                tryMergeMoves(MoveEnd.Source, lhsMoveOut, rhs, moveEffects)
            ) {
                return true;
            }
            break;
        }
        case "Revive": {
            const lhsReattach = lhs as Reattach;
            if (
                rhs.detachedBy === lhsReattach.detachedBy &&
                lhsReattach.detachIndex + lhsReattach.count === rhs.detachIndex
            ) {
                lhsReattach.count += rhs.count;
                return true;
            }
            break;
        }
        default:
            break;
    }
    return false;
}

function tryMergeMoves(
    end: MoveEnd,
    left: MoveMark<unknown>,
    right: MoveMark<unknown>,
    moveEffects: MoveEffectTable<unknown>,
): boolean {
    const oppEnd = end === MoveEnd.Source ? MoveEnd.Dest : MoveEnd.Source;
    const effect = getOrCreateEffect(moveEffects, end, left.id);
    if (effect.mergeRight !== undefined) {
        getOrCreateEffect(moveEffects, end, effect.mergeRight).mergeRight = right.id;
        getOrCreateEffect(moveEffects, end, right.id).mergeLeft = effect.mergeRight;
    } else {
        getOrCreateEffect(moveEffects, end, left.id).mergeRight = right.id;
        getOrCreateEffect(moveEffects, end, right.id).mergeRight = left.id;
    }

    if (getOrCreateEffect(moveEffects, oppEnd, left.id).mergeRight === right.id) {
        const nextId = getOrCreateEffect(moveEffects, oppEnd, right.id).mergeRight;
        getOrCreateEffect(moveEffects, oppEnd, left.id).mergeRight = nextId;
        left.count += right.count;

        // TODO: Add effect to re-split these partitions
        return true;
    }
    return false;
}
