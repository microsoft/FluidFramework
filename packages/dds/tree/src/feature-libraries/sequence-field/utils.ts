/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { clone, fail } from "../../util";
import { IdAllocator } from "../modular-schema";
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
    MoveId,
    MoveIn,
    MoveOut,
    ObjectMark,
    Reattach,
    ReturnFrom,
    ReturnTo,
    SizedMark,
    SizedObjectMark,
    Skip,
} from "./format";

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
            fail(`Unable to split ${type} mark of length 1`);
        case "Delete":
            return [
                { ...markObj, count: length },
                { ...markObj, count: remainder },
            ] as [TMark, TMark];
        case "MoveOut":
        case "ReturnFrom": {
            // TODO: Handle detach index for ReturnFrom
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
            fail(`Unable to split ${type} mark of length 1`);
        case "Delete":
        case "MoveOut":
        case "ReturnFrom":
            fail(`Unable to split ${type} mark of length 0`);
        case "Insert":
            return [
                { ...markObj, content: markObj.content.slice(0, length) },
                { ...markObj, content: markObj.content.slice(length) },
            ] as [TMark, TMark];
        case "MoveIn":
        case "ReturnTo": {
            // TODO: Handle detachIndex
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
            if (isEqualPlace(lhsMoveIn, rhs) && moveEffects !== undefined) {
                const prevMerge = moveEffects.dstMergeable.get(lhsMoveIn.id);
                if (prevMerge !== undefined) {
                    moveEffects.dstMergeable.set(prevMerge, rhs.id);
                } else {
                    moveEffects.dstMergeable.set(lhsMoveIn.id, rhs.id);
                }

                if (
                    moveEffects.allowMerges &&
                    moveEffects.srcMergeable.get(lhsMoveIn.id) === rhs.id
                ) {
                    const nextId = moveEffects.srcMergeable.get(rhs.id);
                    if (nextId !== undefined) {
                        moveEffects.srcMergeable.set(lhsMoveIn.id, nextId);
                    }
                    lhsMoveIn.count += rhs.count;
                    return true;
                }
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
        case "MoveOut":
        case "ReturnFrom": {
            // TODO: Handle reattach fields
            const lhsMoveOut = lhs as MoveOut | ReturnFrom;
            if (rhs.tomb === lhsMoveOut.tomb && moveEffects !== undefined) {
                const prevMerge = moveEffects.srcMergeable.get(lhsMoveOut.id);
                if (prevMerge !== undefined) {
                    moveEffects.srcMergeable.set(prevMerge, rhs.id);
                } else {
                    moveEffects.srcMergeable.set(lhsMoveOut.id, rhs.id);
                }

                if (
                    moveEffects.allowMerges &&
                    moveEffects.dstMergeable.get(lhsMoveOut.id) === rhs.id
                ) {
                    const nextId = moveEffects.dstMergeable.get(rhs.id);
                    if (nextId !== undefined) {
                        moveEffects.dstMergeable.set(lhsMoveOut.id, nextId);
                    }
                    lhsMoveOut.count += rhs.count;
                    return true;
                }
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

export interface MoveEffectTable<T> {
    srcEffects: Map<MoveId, MovePartition<T>[]>;
    dstEffects: Map<MoveId, MovePartition<T>[]>;
    splitIdToOrigId: Map<MoveId, MoveId>;
    idRemappings: Map<MoveId, MoveId>;
    movedMarks: Map<MoveId, Mark<T>[]>;

    /**
     * Set of marks with validated MoveIds. Used to avoid remapping IDs on marks generated by splits.
     */
    validatedMarks: Set<Mark<T>>;
    srcMergeable: Map<MoveId, MoveId>;
    dstMergeable: Map<MoveId, MoveId>;
    allowMerges: boolean;
}

export function newMoveEffectTable<T>(): MoveEffectTable<T> {
    return {
        srcEffects: new Map(),
        dstEffects: new Map(),
        splitIdToOrigId: new Map(),
        idRemappings: new Map(),
        movedMarks: new Map(),
        validatedMarks: new Set(),
        srcMergeable: new Map(),
        dstMergeable: new Map(),
        allowMerges: true,
    };
}

export interface MovePartition<TNodeChange> {
    id: MoveId;

    // Undefined means the partition is the same size as the input.
    count?: number;
    replaceWith?: Mark<TNodeChange>[];
    modifyAfter?: TNodeChange;
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
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);

        // TODO: Assert that the sums of the partition sizes match
        effect.splice(index, 1, ...parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, origId);
        }
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

    const rightId = table.srcMergeable.get(id);
    if (parts.length > 0) {
        if (rightId !== undefined) {
            table.srcMergeable.set(parts[parts.length - 1].id, rightId);
        }
        for (let i = 1; i < parts.length; i++) {
            table.srcMergeable.set(parts[i - 1].id, parts[i].id);
        }
    } else {
        const leftId = findKey(table.srcMergeable, id);
        if (leftId !== undefined && rightId !== undefined) {
            table.srcMergeable.set(leftId, rightId);
        }
        table.srcMergeable.delete(id);
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

        effect.splice(index, 1, ...parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, origId);
        }
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

    const rightId = table.dstMergeable.get(id);
    if (parts.length > 0) {
        if (rightId !== undefined) {
            table.dstMergeable.set(parts[parts.length - 1].id, rightId);
        }
        for (let i = 1; i < parts.length; i++) {
            table.dstMergeable.set(parts[i - 1].id, parts[i].id);
        }
    } else {
        const leftId = findKey(table.dstMergeable, id);
        if (leftId !== undefined && rightId !== undefined) {
            table.dstMergeable.set(leftId, rightId);
        }
        table.dstMergeable.delete(id);
    }
}

export function replaceMoveDest<T>(table: MoveEffectTable<T>, id: MoveId, mark: Attach<T>): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.dstEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        assert(effect[index].replaceWith === undefined, "Move dest already replaced");
        effect[index].replaceWith = [mark];
    } else {
        assert(!table.dstEffects.has(id), "This MoveId cannot be replaced");
        table.dstEffects.set(id, [{ id, replaceWith: [mark] }]);
    }
}

export function removeMoveDest(table: MoveEffectTable<unknown>, id: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.dstEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        effect.splice(index, 1);
    } else {
        table.dstEffects.set(id, []);
    }

    const rightId = table.dstMergeable.get(id);
    const leftId = findKey(table.dstMergeable, id);
    if (rightId !== undefined && leftId !== undefined) {
        table.dstMergeable.set(leftId, rightId);
    }
    table.dstMergeable.delete(id);
}

export function modifyMoveSrc<T>(table: MoveEffectTable<T>, id: MoveId, change: T): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        assert(effect[index].replaceWith === undefined, "Move source already replaced");
        assert(effect[index].modifyAfter === undefined, "Move source already been modified");
        effect[index].modifyAfter = change;
    } else {
        table.srcEffects.set(id, [{ id, modifyAfter: change }]);
    }

    table.srcMergeable.delete(id);
    const leftId = findKey(table.srcMergeable, id);
    if (leftId !== undefined) {
        table.srcMergeable.delete(leftId);
    }
}

export function replaceMoveSrc<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    mark: SizedObjectMark<T>,
): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        assert(effect[index].replaceWith === undefined, "Move source already replaced");
        effect[index].replaceWith = [mark];
    } else {
        table.srcEffects.set(id, [{ id, replaceWith: [mark] }]);
        table.splitIdToOrigId.set(id, id);
    }
}

export function removeMoveSrc(table: MoveEffectTable<unknown>, id: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        effect.splice(index, 1);
    } else {
        table.srcEffects.set(id, []);
    }

    const rightId = table.srcMergeable.get(id);
    const leftId = findKey(table.srcMergeable, id);
    if (rightId !== undefined && leftId !== undefined) {
        table.srcMergeable.set(leftId, rightId);
    }
    table.srcMergeable.delete(id);
}

export function replaceMoveId<T>(table: MoveEffectTable<T>, id: MoveId, newId: MoveId): void {
    assert(!table.idRemappings.has(id), "Cannot remap ID which has already been remapped");
    table.idRemappings.set(id, newId);
}

export function findKey<K, V>(map: Map<K, V>, value: V): K | undefined {
    for (const [k, v] of map) {
        if (v === value) {
            return k;
        }
    }
    return undefined;
}

export function changeSrcMoveId<T>(table: MoveEffectTable<T>, id: MoveId, newId: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const effect = table.srcEffects.get(origId)!;
        const index = effect.findIndex((p) => p.id === id);
        effect[index].id = newId;
        // TODO: Need to update splitIdToOrigId?
    } else {
        table.srcEffects.set(id, [{ id: newId }]);
    }

    const rightId = table.srcMergeable.get(id);
    if (rightId !== undefined) {
        table.srcMergeable.set(newId, rightId);
    }

    const leftId = findKey(table.srcMergeable, id);
    if (leftId !== undefined) {
        table.srcMergeable.set(leftId, newId);
    }
}

export type MoveMark<T> = MoveOut<T> | MoveIn | ReturnFrom<T> | ReturnTo;

export function isMoveMark<T>(mark: Mark<T>): mark is MoveMark<T> {
    if (isSkipMark(mark)) {
        return false;
    }
    switch (mark.type) {
        case "MoveIn":
        case "MoveOut":
        case "ReturnFrom":
        case "ReturnTo":
            return true;
        default:
            return false;
    }
}

export function splitMoveIn<T>(mark: MoveIn | ReturnTo, parts: MovePartition<T>[]): Mark<T>[] {
    const result: Mark<T>[] = [];
    for (const part of parts) {
        assert(part.modifyAfter === undefined, "Cannot modify move destination");
        if (part.replaceWith !== undefined) {
            result.push(...part.replaceWith);
        } else {
            result.push({
                ...mark,
                id: part.id,
                count: part.count ?? mark.count,
            });
        }
    }
    return result;
}

export function splitMoveOut<T>(
    mark: MoveOut<T> | ReturnFrom<T>,
    parts: MovePartition<T>[],
    composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
    const result: Mark<T>[] = [];
    for (const part of parts) {
        if (part.replaceWith !== undefined) {
            result.push(...part.replaceWith);
        } else {
            const splitMark: MoveOut<T> | ReturnFrom<T> = {
                ...mark,
                id: part.id,
                count: part.count ?? mark.count,
            };
            if (part.modifyAfter !== undefined) {
                assert(
                    composeChildren !== undefined,
                    "Must provide a change composer if modifying moves",
                );
                const changes = composeChildren(mark.changes, part.modifyAfter);
                if (changes !== undefined) {
                    splitMark.changes = changes;
                } else {
                    delete splitMark.changes;
                }
            }
            result.push(splitMark);
        }
    }
    return result;
}

export function applyMoveEffectsToMark<T>(
    inputMark: Mark<T>,
    revision: RevisionTag | undefined,
    moveEffects: MoveEffectTable<T>,
    genId: IdAllocator,
    reassignIds: boolean,
    composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
    let mark = inputMark;
    if (isMoveMark(mark)) {
        if (reassignIds) {
            const newId = getUniqueMoveId(mark, revision, genId, moveEffects);
            if (newId !== mark.id) {
                mark = clone(mark);
                mark.id = newId;
                moveEffects.validatedMarks.add(mark);
            }
        }

        const type = mark.type;
        switch (type) {
            case "MoveOut":
            case "ReturnFrom": {
                const effect = moveEffects.srcEffects.get(mark.id);
                if (effect !== undefined) {
                    moveEffects.srcEffects.delete(mark.id);
                    const splitMarks = splitMoveOut(mark, effect, composeChildren);
                    for (const splitMark of splitMarks) {
                        moveEffects.validatedMarks.add(splitMark);
                    }
                    return splitMarks;
                }
                break;
            }
            case "MoveIn":
            case "ReturnTo": {
                const effect = moveEffects.dstEffects.get(mark.id);
                if (effect !== undefined) {
                    moveEffects.dstEffects.delete(mark.id);
                    const splitMarks = splitMoveIn(mark, effect);
                    for (const splitMark of splitMarks) {
                        moveEffects.validatedMarks.add(splitMark);
                    }
                    return splitMarks;
                }
                break;
            }
            default:
                unreachableCase(type);
        }
    }
    return [mark];
}

export function getUniqueMoveId<T>(
    mark: MoveMark<T>,
    revision: RevisionTag | undefined,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<T>,
): MoveId {
    if (!moveEffects.validatedMarks.has(mark) && (mark.revision ?? revision === undefined)) {
        let newId = moveEffects.idRemappings.get(mark.id);
        if (newId === undefined) {
            newId = genId();
            replaceMoveId(moveEffects, mark.id, newId);
        }
        return newId;
    }
    return mark.id;
}
