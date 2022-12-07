/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
    Attach,
    Detach,
    HasTiebreakPolicy,
    Insert,
    LineageEvent,
    Mark,
    Modify,
    ModifyDetach,
    ModifyingMark,
    ModifyReattach,
    MoveId,
    MoveIn,
    MoveOut,
    ObjectMark,
    Reattach,
    SizedMark,
    SizedObjectMark,
    Skip,
} from "./format";

export function isModify<TNodeChange>(mark: Mark<TNodeChange>): mark is Modify<TNodeChange> {
    return isObjMark(mark) && mark.type === "Modify";
}

export function isModifyingMark<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is ModifyingMark<TNodeChange> {
    return (
        isObjMark(mark) &&
        (mark.type === "Modify" ||
            mark.type === "MInsert" ||
            mark.type === "MRevive" ||
            mark.type === "MMoveIn" ||
            mark.type === "MReturn" ||
            mark.type === "MDelete" ||
            mark.type === "MMoveOut")
    );
}

export function isAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is Attach<TNodeChange> {
    return (
        (isObjMark(mark) &&
            (mark.type === "Insert" ||
                mark.type === "MInsert" ||
                mark.type === "MoveIn" ||
                mark.type === "MMoveIn")) ||
        isReattach(mark)
    );
}

export function isReattach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Reattach | ModifyReattach<TNodeChange> {
    return (
        isObjMark(mark) &&
        (mark.type === "Revive" ||
            mark.type === "MRevive" ||
            mark.type === "Return" ||
            mark.type === "MReturn")
    );
}

export function getAttachLength(attach: Attach): number {
    const type = attach.type;
    switch (type) {
        case "MInsert":
        case "MMoveIn":
        case "MRevive":
        case "MReturn":
            return 1;
        case "Insert":
            return attach.content.length;
        case "MoveIn":
        case "Revive":
        case "Return":
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
            return mark.count;
        case "Modify":
        case "MDelete":
        case "MMoveOut":
            return 1;
        default:
            unreachableCase(type);
    }
}

export function isSkipMark(mark: Mark<unknown>): mark is Skip {
    return typeof mark === "number";
}

/**
 * Splits the `mark` into two marks such that the first returned mark has input length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMarkOnInput<TMark extends SizedMark<unknown>>(
    mark: TMark,
    length: number,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<unknown>,
): [TMark, TMark] {
    const markLength = getInputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(
            `Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`,
        );
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as SizedObjectMark;
    const type = mark.type;
    switch (type) {
        case "Modify":
        case "MDelete":
        case "MMoveOut":
            fail(`Unable to split ${type} mark of length 1`);
        case "Delete":
            return [
                { ...markObj, count: length },
                { ...markObj, count: remainder },
            ] as [TMark, TMark];
        case "MoveOut": {
            const newId = genId();
            splitMoveDest(moveEffects, mark.id, [
                { id: mark.id, count: length },
                { id: newId, count: remainder },
            ]);
            return [
                { ...markObj, count: length },
                { ...markObj, id: newId, count: remainder },
            ] as [TMark, TMark];
        }
        default:
            unreachableCase(type);
    }
}

/**
 * Splits the `mark` into two marks such that the first returned mark has output length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has output length `length`.
 */
export function splitMarkOnOutput<TMark extends Mark<unknown>>(
    mark: TMark,
    length: number,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<unknown>,
): [TMark, TMark] {
    const markLength = getOutputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(
            `Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`,
        );
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as ObjectMark;
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
        case "MoveIn": {
            const newId = genId();
            splitMoveSrc(moveEffects, markObj.id, [
                { id: markObj.id, count: length },
                { id: newId, count: remainder },
            ]);
            return [
                { ...markObj, count: length },
                { ...markObj, id: newId, count: remainder },
            ] as [TMark, TMark];
        }
        case "Return":
        case "Revive":
            return [
                { ...markObj, count: length },
                { ...markObj, count: remainder, detachIndex: markObj.detachIndex + length },
            ] as [TMark, TMark];
        default:
            unreachableCase(type);
    }
}

export function isDetachMark<TNodeChange>(
    mark: Mark<TNodeChange> | undefined,
): mark is Detach | ModifyDetach<TNodeChange> {
    if (isObjMark(mark)) {
        const type = mark.type;
        return type === "Delete" || type === "MDelete" || type === "MoveOut" || type === "MMoveOut";
    }
    return false;
}

export function isObjMark<TNodeChange>(
    mark: Mark<TNodeChange> | undefined,
): mark is ObjectMark<TNodeChange> {
    return typeof mark === "object";
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(lhs: ObjectMark, rhs: Readonly<ObjectMark>): boolean {
    if (rhs.type !== lhs.type || rhs.revision !== lhs.revision) {
        return false;
    }
    const type = rhs.type;
    switch (type) {
        case "Insert": {
            const lhsInsert = lhs as Insert;
            if (isEqualPlace(lhsInsert, rhs)) {
                lhsInsert.content.push(...rhs.content);
                return true;
            }
            break;
        }
        case "MoveIn": {
            // TODO: Attempt to merge even if IDs are not equal
            const lhsMoveIn = lhs as MoveIn;
            if (rhs.id === lhsMoveIn.id && isEqualPlace(lhsMoveIn, rhs)) {
                lhsMoveIn.count += rhs.count;
                return true;
            }
            break;
        }
        case "Delete": {
            const lhsDetach = lhs as Detach;
            if (rhs.tomb === lhsDetach.tomb) {
                lhsDetach.count += rhs.count;
                return true;
            }
            break;
        }
        case "MoveOut": {
            const lhsMoveOut = lhs as MoveOut;
            if (rhs.tomb === lhsMoveOut.tomb && rhs.id === lhsMoveOut.id) {
                lhsMoveOut.count += rhs.count;
                return true;
            }
            break;
        }
        case "Revive":
        case "Return": {
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

export interface MoveEffectTable<T> {
    srcEffects: Map<MoveId, MoveSrcEffect<T>>;
    dstEffects: Map<MoveId, MoveDestEffect<T>>;
    splitIdToOrigId: Map<MoveId, MoveId>;
    idRemappings: Map<MoveId, MoveId>;

    /**
     * Set of marks with validated MoveIds. Used to avoid remapping IDs on marks generated by splits.
     */
    validatedMarks: Set<Mark<T>>;
}

export function newMoveEffectTable<T>(): MoveEffectTable<T> {
    return {
        srcEffects: new Map(),
        dstEffects: new Map(),
        splitIdToOrigId: new Map(),
        idRemappings: new Map(),
        validatedMarks: new Set(),
    };
}

type MoveSrcEffect<T> = MovePartition<T>[];
type MoveDestEffect<T> = MovePartition<T>[];

export interface MovePartition<T> {
    id: MoveId;

    // Undefined means the partition is the same size as the input.
    count?: number;
    replaceWith?: Attach<T>[];
}

export function splitMoveSrc<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    parts: MovePartition<T>[],
): void {
    // TODO: Do we need a separate splitIdToOrigId for src and dst? Or do we need to eagerly apply splits when processing?
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(id)!;
        const index = effect.findIndex((p) => p.id === id);

        // TODO: Assert that the sums of the partition sizes match
        effect.splice(index, 1, ...parts);
    } else {
        assert(
            !table.srcEffects.has(id),
            "There should be an entry in splitIdToOrigId for this ID",
        );
        table.srcEffects.set(id, parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, id);
        }
    }
}

export function splitMoveDest<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    parts: MovePartition<T>[],
): void {
    // TODO: What if source has been deleted?
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.dstEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);

        // TODO: Assert that the sums of the partition sizes match
        effect.splice(index, 1, ...parts);
    } else {
        assert(
            !table.dstEffects.has(id),
            "There should be an entry in splitIdToOrigId for this ID",
        );
        table.dstEffects.set(id, parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, id);
        }
    }
}

export function replaceMoveDest<T>(table: MoveEffectTable<T>, id: MoveId, mark: Attach<T>): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId === undefined) {
        assert(!table.dstEffects.has(id), "This MoveId cannot be replaced");
        table.dstEffects.set(id, [{ id, replaceWith: [mark] }]);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.dstEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        effect[index].replaceWith = [mark];
    }
}

export function deleteMoveSource(table: MoveEffectTable<unknown>, id: MoveId): void {
    table.srcEffects.set(id, []);
}

export function replaceMoveId<T>(table: MoveEffectTable<T>, id: MoveId, newId: MoveId): void {
    assert(!table.idRemappings.has(id), "Cannot remap ID which has already been remapped");
    table.idRemappings.set(id, newId);
}

export function changeSrcMoveId<T>(table: MoveEffectTable<T>, id: MoveId, newId: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        effect[index].id = newId;
    } else {
        table.srcEffects.set(id, [{ id: newId }]);
    }
}
