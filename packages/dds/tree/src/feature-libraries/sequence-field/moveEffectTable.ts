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
    Mark,
    MoveId,
    MoveIn,
    MoveOut,
    ObjectMark,
    ReturnFrom,
    ReturnTo,
    SizedMark,
    SizedObjectMark,
} from "./format";
import { getInputLength, getOutputLength, isSkipMark } from "./utils";

export interface MoveEffectTable<T> {
    srcEffects: Map<MoveId, MovePartition<T>[]>;
    dstEffects: Map<MoveId, MovePartition<T>[]>;
    splitIdToOrigId: Map<MoveId, MoveId>;
    idRemappings: Map<MoveId, MoveId>;
    movedMarks: Map<MoveId, Mark<T>[]>;
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
    if ((mark.revision ?? revision) === undefined) {
        let newId = moveEffects.idRemappings.get(mark.id);
        if (newId === undefined) {
            newId = genId();
            replaceMoveId(moveEffects, mark.id, newId);
        }
        return newId;
    }
    return mark.id;
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
