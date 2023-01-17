/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { clone, fail, getOrAddEmptyToMap } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
    Attach,
    InputSpanningMark,
    Mark,
    MoveId,
    MoveIn,
    MoveOut,
    OutputSpanningMark,
    ReturnFrom,
    ReturnTo,
    Skip,
} from "./format";
import { getInputLength, getOutputLength, isConflicted, isSkipMark } from "./utils";

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

export enum PairedMarkUpdate {
    /**
     * Indicates that the mark's matching mark is now inactive.
     */
    Deactivated,
    /**
     * Indicates that the mark's matching mark is now active.
     */
    Reactivated,
}

export interface MovePartition<TNodeChange> {
    id: MoveId;

    // Undefined means the partition is the same size as the input.
    count?: number;
    replaceWith?: Mark<TNodeChange>[];
    modifyAfter?: TNodeChange;
    /**
     * When set, updates the mark's paired mark status.
     */
    pairedMarkStatus?: PairedMarkUpdate;
    /**
     * When set, updates the mark's `detachedBy` field.
     */
    detachedBy?: RevisionTag;
}

export function splitMoveSrc<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    parts: MovePartition<T>[],
): void {
    // TODO: Do we need a separate splitIdToOrigId for src and dst? Or do we need to eagerly apply splits when processing?
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const index = effect.findIndex((p) => p.id === id);

        // TODO: Assert that the sums of the partition sizes match
        effect.splice(index, 1, ...parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, origId);
        }
    } else {
        assert(
            !table.srcEffects.has(id),
            0x4e5 /* There should be an entry in splitIdToOrigId for this ID */,
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
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
        const index = effect.findIndex((p) => p.id === id);

        effect.splice(index, 1, ...parts);
        for (const { id: newId } of parts) {
            table.splitIdToOrigId.set(newId, origId);
        }
    } else {
        assert(
            !table.dstEffects.has(id),
            0x4e6 /* There should be an entry in splitIdToOrigId for this ID */,
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
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        assert(partition.replaceWith === undefined, 0x4e7 /* Move dest already replaced */);
        partition.replaceWith = [mark];
    } else {
        assert(!table.dstEffects.has(id), 0x4e8 /* This MoveId cannot be replaced */);
        table.dstEffects.set(id, [{ id, replaceWith: [mark] }]);
    }
}

export function removeMoveDest(table: MoveEffectTable<unknown>, id: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
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
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        assert(partition.replaceWith === undefined, 0x4e9 /* Move source already replaced */);
        assert(partition.modifyAfter === undefined, 0x4ea /* Move source already been modified */);
        partition.modifyAfter = change;
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
    mark: InputSpanningMark<T>,
): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        assert(partition.replaceWith === undefined, 0x4eb /* Move source already replaced */);
        partition.replaceWith = [mark];
    } else {
        table.srcEffects.set(id, [{ id, replaceWith: [mark] }]);
        table.splitIdToOrigId.set(id, id);
    }
}

export function updateMoveSrcPairing<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    pairedMarkStatus: PairedMarkUpdate,
): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        partition.pairedMarkStatus = pairedMarkStatus;
    } else {
        table.srcEffects.set(id, [{ id, pairedMarkStatus }]);
        table.splitIdToOrigId.set(id, id);
    }
}

export function updateMoveDestPairing<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    pairedMarkStatus: PairedMarkUpdate,
): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        partition.pairedMarkStatus = pairedMarkStatus;
    } else {
        assert(!table.dstEffects.has(id), 0x4ec /* This MoveId cannot be replaced */);
        table.dstEffects.set(id, [{ id, pairedMarkStatus }]);
    }
}

export function updateMoveSrcDetacher<T>(
    table: MoveEffectTable<T>,
    id: MoveId,
    detachedBy: RevisionTag | undefined,
): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        partition.detachedBy = detachedBy;
    } else {
        table.srcEffects.set(id, [{ id, detachedBy }]);
        table.splitIdToOrigId.set(id, id);
    }
}

export function removeMoveSrc(table: MoveEffectTable<unknown>, id: MoveId): void {
    const origId = table.splitIdToOrigId.get(id);
    if (origId !== undefined) {
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
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
    assert(
        !table.idRemappings.has(id),
        0x4ed /* Cannot remap ID which has already been remapped */,
    );
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
        const effect = getOrAddEmptyToMap(table.srcEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        partition.id = newId;
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

function getOrAddMovePartition<T>(partitions: MovePartition<T>[], id: MoveId): MovePartition<T> {
    const index = partitions.findIndex((p) => p.id === id);
    if (index === -1) {
        const partition = { id };
        partitions.push(partition);
        return partition;
    }
    return partitions[index];
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

export function splitMoveIn<T>(
    mark: MoveIn | ReturnTo,
    updatePairedMarkStatus: boolean,
    parts: MovePartition<T>[],
): Mark<T>[] {
    const result: Mark<T>[] = [];
    let cumulativeCount = 0;
    for (const part of parts) {
        assert(part.modifyAfter === undefined, 0x4ee /* Cannot modify move destination */);
        if (part.replaceWith !== undefined) {
            cumulativeCount += part.count ?? mark.count;
            result.push(...part.replaceWith);
        } else {
            const portion = {
                ...mark,
                id: part.id,
                count: part.count ?? mark.count,
            };
            if (mark.type === "ReturnTo") {
                const returnTo = portion as ReturnTo;
                returnTo.detachIndex = mark.detachIndex + cumulativeCount;
                cumulativeCount += portion.count;
                if (updatePairedMarkStatus && part.pairedMarkStatus !== undefined) {
                    if (part.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
                        returnTo.isSrcConflicted = true;
                    } else {
                        delete returnTo.isSrcConflicted;
                    }
                }
            }
            result.push(portion);
        }
    }
    return result;
}

export function splitMoveOut<T>(
    mark: MoveOut<T> | ReturnFrom<T>,
    parts: MovePartition<T>[],
    updatePairedMarkStatus: boolean,
    composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
    const result: Mark<T>[] = [];
    let cumulativeCount = 0;
    for (const part of parts) {
        if (part.replaceWith !== undefined) {
            cumulativeCount += part.count ?? mark.count;
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
                    0x4ef /* Must provide a change composer if modifying moves */,
                );
                const changes = composeChildren(mark.changes, part.modifyAfter);
                if (changes !== undefined) {
                    splitMark.changes = changes;
                } else {
                    delete splitMark.changes;
                }
            }
            if (updatePairedMarkStatus && part.pairedMarkStatus !== undefined) {
                assert(
                    splitMark.type === "ReturnFrom",
                    0x4f0 /* TODO: support updating MoveOut.isSrcConflicted */,
                );
                if (part.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
                    splitMark.isDstConflicted = true;
                } else {
                    delete splitMark.isDstConflicted;
                }
            }
            if (part.detachedBy !== undefined) {
                assert(
                    splitMark.type === "ReturnFrom",
                    0x4f1 /* Only ReturnFrom marks can have their detachBy field set */,
                );
                splitMark.detachedBy = part.detachedBy;
            }
            if (splitMark.type === "ReturnFrom" && isConflicted(mark)) {
                assert(
                    splitMark.detachIndex !== undefined,
                    0x4f2 /* Conflicted ReturnFrom should have a detachIndex */,
                );
                const returnFrom = splitMark as ReturnFrom;
                returnFrom.detachIndex = splitMark.detachIndex + cumulativeCount;
                cumulativeCount += splitMark.count;
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
    updatePairedMarkStatus: boolean,
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
                    const splitMarks = splitMoveOut(
                        mark,
                        effect,
                        updatePairedMarkStatus,
                        composeChildren,
                    );
                    return splitMarks;
                }
                break;
            }
            case "MoveIn":
            case "ReturnTo": {
                const effect = moveEffects.dstEffects.get(mark.id);
                if (effect !== undefined) {
                    moveEffects.dstEffects.delete(mark.id);
                    const splitMarks = splitMoveIn(mark, updatePairedMarkStatus, effect);
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
    // TODO: avoid reassigning IDs when the revision ID already makes the ID unique
    // This should be the case when (mark.revision ?? revision) !== undefined but
    // this revision-based uniqueness is not yet supported everywhere.
    let newId = moveEffects.idRemappings.get(mark.id);
    if (newId === undefined) {
        newId = genId();
        replaceMoveId(moveEffects, mark.id, newId);
    }
    return newId;
}

/**
 * Splits the `mark` into two marks such that the first returned mark has input length `length`.
 * @param mark - The mark to split.
 * @param length - The desired length for the first of the two returned marks.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMarkOnInput<TMark extends InputSpanningMark<unknown>>(
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
    const markObj = mark as Exclude<TMark, Skip>;
    const type = mark.type;
    switch (type) {
        case "Modify":
            fail(`Unable to split ${type} mark of length 1`);
        case "ReturnTo": {
            const newId = genId();
            splitMoveSrc(moveEffects, mark.id, [
                { id: mark.id, count: length },
                { id: newId, count: remainder },
            ]);
            return [
                { ...markObj, count: length },
                { ...markObj, id: newId, count: remainder, detachIndex: mark.detachIndex + length },
            ] as [TMark, TMark];
        }
        case "Revive":
            return [
                { ...markObj, count: length },
                { ...markObj, count: remainder, detachIndex: mark.detachIndex + length },
            ] as [TMark, TMark];
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
export function splitMarkOnOutput<TMark extends OutputSpanningMark<unknown>>(
    mark: TMark,
    length: number,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<unknown>,
    ignorePairing: boolean = false,
): [TMark, TMark] {
    const markLength = getOutputLength(mark, ignorePairing);
    const remainder = markLength - length;
    if (length < 1 || remainder < 1) {
        fail(
            `Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`,
        );
    }
    if (isSkipMark(mark)) {
        return [length, remainder] as [TMark, TMark];
    }
    const markObj = mark as Exclude<TMark, Skip>;
    const type = markObj.type;
    switch (type) {
        case "Modify":
            fail(`Unable to split ${type} mark of length 1`);
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
                type === "MoveIn"
                    ? { ...markObj, id: newId, count: remainder }
                    : {
                          ...markObj,
                          id: newId,
                          count: remainder,
                          detachIndex: markObj.detachIndex + length,
                      },
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
