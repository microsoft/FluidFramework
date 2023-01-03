/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { clone, fail, getOrAddEmptyToMap, StackyIterator } from "../../util";
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
    NewAttach,
    MoveOut,
    ObjectMark,
    InputSpanningMark,
    Reattach,
    ReturnFrom,
    ReturnTo,
    Skip,
    Muted,
    Mutable,
    OutputSpanningMark,
    Changeset,
} from "./format";
import { MarkListFactory } from "./markListFactory";

export function isModify<TNodeChange>(mark: Mark<TNodeChange>): mark is Modify<TNodeChange> {
    return isObjMark(mark) && mark.type === "Modify";
}

export function isNewAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is NewAttach<TNodeChange> {
    return isObjMark(mark) && (mark.type === "Insert" || mark.type === "MoveIn");
}

export function isAttach<TNodeChange>(mark: Mark<TNodeChange>): mark is Attach<TNodeChange> {
    return isNewAttach(mark) || isReattach(mark);
}

export function isAttachInGap<TNodeChange>(mark: Mark<TNodeChange>): mark is Attach<TNodeChange> {
    return isNewAttach(mark) || isActiveReattach(mark) || isBlockedReattach(mark);
}

export function isReattach<TNodeChange>(mark: Mark<TNodeChange>): mark is Reattach<TNodeChange> {
    return isObjMark(mark) && (mark.type === "Revive" || mark.type === "ReturnTo");
}

export function isActiveReattach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> & Muted {
    // No need to check Reattach.lastDeletedBy because it can only be set if the mark is muted
    return isReattach(mark) && !isMuted(mark);
}

export function isMutedReattach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> & Muted {
    return isReattach(mark) && isMuted(mark);
}

export function isMutedDetach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Detach<TNodeChange> & Muted {
    return isDetachMark(mark) && isMuted(mark);
}

export function isSkipLikeReattach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> & Muted {
    return isMutedReattach(mark) && mark.lastDetachedBy === undefined;
}

export function isBlockedReattach<TNodeChange>(
    mark: Mark<TNodeChange>,
): mark is Reattach<TNodeChange> & Muted {
    return isMutedReattach(mark) && mark.lastDetachedBy !== undefined;
}

export function isMuted(mark: Mutable): mark is Muted {
    return mark.mutedBy !== undefined;
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
 * @param ignorePairing - When true, the length of a src or dst mark is whose matching src or dst is not active
 * will be treated the same as if that matching src or dst were active.
 * @returns The number of nodes within the output context of the mark.
 */
export function getOutputLength(mark: Mark<unknown>, ignorePairing: boolean = false): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    const type = mark.type;
    switch (type) {
        case "ReturnTo":
            return mark.isSrcMuted && !ignorePairing ? 0 : mark.count;
        case "Revive":
        case "MoveIn":
            return mark.count;
        case "Insert":
            return mark.content.length;
        case "Modify":
            return 1;
        case "ReturnFrom":
            return mark.isDstMuted && !ignorePairing ? mark.count : 0;
        case "Delete":
        case "MoveOut":
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
        if (isSkipLikeReattach(mark)) {
            return mark.count;
        }
        return 0;
    }
    const type = mark.type;
    switch (type) {
        case "Delete":
        case "MoveOut":
        case "ReturnFrom":
            return isMuted(mark) ? 0 : mark.count;
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
    allowUnpairedMark: boolean = false,
): [TMark, TMark] {
    const markLength = getOutputLength(mark, allowUnpairedMark);
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
            const lhsMoveIn = lhs as MoveIn | ReturnTo;
            if (isEqualPlace(lhsMoveIn, rhs) && moveEffects !== undefined) {
                if (lhsMoveIn.type === "ReturnTo") {
                    // Verify that the ReturnTo fields line up
                    const rhsReturnTo = rhs as ReturnTo;
                    if (
                        lhsMoveIn.detachedBy !== rhsReturnTo.detachedBy ||
                        lhsMoveIn.lastDetachedBy !== rhsReturnTo.lastDetachedBy ||
                        lhsMoveIn.detachIndex + lhsMoveIn.count !== rhsReturnTo.detachIndex
                    ) {
                        break;
                    }
                }
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
            const lhsMoveOut = lhs as MoveOut | ReturnFrom;
            if (rhs.tomb === lhsMoveOut.tomb && moveEffects !== undefined) {
                if (
                    lhsMoveOut.type === "ReturnFrom" &&
                    !areMergeableReturnFrom(lhs as ReturnFrom, rhs as ReturnFrom)
                ) {
                    break;
                }
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
                rhs.mutedBy === lhsReattach.mutedBy &&
                rhs.isIntention === lhsReattach.isIntention &&
                rhs.lastDetachedBy === lhsReattach.lastDetachedBy &&
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

function areMergeableReturnFrom(lhs: ReturnFrom, rhs: ReturnFrom): boolean {
    if (
        lhs.detachedBy !== rhs.detachedBy ||
        lhs.mutedBy !== rhs.mutedBy ||
        lhs.revision !== rhs.revision
    ) {
        return false;
    }
    if (lhs.detachIndex !== undefined) {
        return lhs.detachIndex + 1 === rhs.detachIndex;
    }
    return rhs.detachIndex === undefined;
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
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
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
        const effect = getOrAddEmptyToMap(table.dstEffects, origId);
        const partition = getOrAddMovePartition(effect, id);
        assert(partition.replaceWith === undefined, "Move dest already replaced");
        partition.replaceWith = [mark];
    } else {
        assert(!table.dstEffects.has(id), "This MoveId cannot be replaced");
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
        assert(partition.replaceWith === undefined, "Move source already replaced");
        assert(partition.modifyAfter === undefined, "Move source already been modified");
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
        assert(partition.replaceWith === undefined, "Move source already replaced");
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
        assert(!table.dstEffects.has(id), "This MoveId cannot be replaced");
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
        assert(part.modifyAfter === undefined, "Cannot modify move destination");
        if (part.replaceWith !== undefined) {
            result.push(...part.replaceWith);
            cumulativeCount += part.count ?? mark.count;
        } else {
            const portion = {
                ...mark,
                id: part.id,
                count: part.count ?? mark.count,
            };
            result.push(portion);
            if (mark.type === "ReturnTo") {
                const returnTo = portion as ReturnTo;
                returnTo.detachIndex = mark.detachIndex + cumulativeCount;
                cumulativeCount += portion.count;
                if (updatePairedMarkStatus && part.pairedMarkStatus !== undefined) {
                    if (part.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
                        returnTo.isSrcMuted = true;
                    } else {
                        delete returnTo.isSrcMuted;
                    }
                }
            }
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
            result.push(...part.replaceWith);
            cumulativeCount += part.count ?? mark.count;
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
            if (updatePairedMarkStatus && part.pairedMarkStatus !== undefined) {
                // TODO: support unpairing for move
                assert(
                    splitMark.type === "ReturnFrom",
                    "Only ReturnFrom marks can be unpaired through move effects",
                );
                if (part.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
                    splitMark.isDstMuted = true;
                } else {
                    delete splitMark.isDstMuted;
                }
            }
            if (part.detachedBy !== undefined) {
                assert(
                    splitMark.type === "ReturnFrom",
                    "Only ReturnFrom marks can have their detachBy field set",
                );
                splitMark.detachedBy = part.detachedBy;
            }
            if (mark.type === "ReturnFrom" && isMuted(mark)) {
                assert(
                    mark.detachIndex !== undefined,
                    "Muted ReturnFrom should have a detachIndex",
                );
                const returnFrom = splitMark as ReturnFrom;
                returnFrom.detachIndex = mark.detachIndex + cumulativeCount;
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
                    const splitMarks = splitMoveOut(
                        mark,
                        effect,
                        updatePairedMarkStatus,
                        composeChildren,
                    );
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
                    const splitMarks = splitMoveIn(mark, updatePairedMarkStatus, effect);
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
    // TODO: avoid reassigning IDs when the revision ID already makes the ID unique
    if (!moveEffects.validatedMarks.has(mark)) {
        let newId = moveEffects.idRemappings.get(mark.id);
        if (newId === undefined) {
            newId = genId();
            replaceMoveId(moveEffects, mark.id, newId);
        }
        return newId;
    }
    return mark.id;
}

interface DetachedNode {
    rev: RevisionTag;
    index: number;
}

/**
 * Keeps track of the different ways detached nodes may be referred to.
 * Allows updating changesets so they refer to a detached node by the details
 * of the last detach that affected them.
 */
export class DetachedNodeTracker {
    private nodes: Map<number, DetachedNode> = new Map();
    private readonly equivalences: { old: DetachedNode; new: DetachedNode }[] = [];

    public constructor() {}

    public apply(change: TaggedChange<Changeset<unknown>>): void {
        let index = 0;
        for (const mark of change.change) {
            const inputLength: number = getInputLength(mark);
            if (isDetachMark(mark)) {
                const newNodes: Map<number, DetachedNode> = new Map();
                const after = index + inputLength;
                for (const [k, v] of this.nodes) {
                    if (k >= index) {
                        if (k >= after) {
                            newNodes.set(k - inputLength, v);
                        } else {
                            // The node is removed
                            this.equivalences.push({
                                old: v,
                                new: {
                                    rev:
                                        mark.revision ??
                                        change.revision ??
                                        fail("Unable to track detached nodes"),
                                    index: k,
                                },
                            });
                        }
                    } else {
                        newNodes.set(k, v);
                    }
                }
                this.nodes = newNodes;
            }
            index += inputLength;
        }
        index = 0;
        for (const mark of change.change) {
            const inputLength: number = getInputLength(mark);
            if (isActiveReattach(mark)) {
                const newNodes: Map<number, DetachedNode> = new Map();
                for (const [k, v] of this.nodes) {
                    if (k >= index) {
                        newNodes.set(k + inputLength, v);
                    } else {
                        newNodes.set(k, v);
                    }
                }
                for (let i = 0; i < mark.count; ++i) {
                    newNodes.set(index + i, {
                        rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
                        index: mark.detachIndex + i,
                    });
                }
                this.nodes = newNodes;
            }
            if (!isDetachMark(mark)) {
                index += inputLength;
            }
        }
    }

    public isApplicable(change: Changeset<unknown>): boolean {
        for (const mark of change) {
            if (isActiveReattach(mark)) {
                const rev = mark.detachedBy ?? fail("Unable to track detached nodes");
                for (let i = 0; i < mark.count; ++i) {
                    const index = mark.detachIndex + i;
                    const original = { rev, index };
                    const updated = this.getUpdatedDetach(original);
                    for (const detached of this.nodes.values()) {
                        if (updated.rev === detached.rev && updated.index === detached.index) {
                            // The new change is attempting to reattach nodes in a location that has already been
                            // filled by a prior reattach.
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    public update<T>(
        change: TaggedChange<Changeset<T>>,
        genId: IdAllocator,
    ): TaggedChange<Changeset<T>> {
        const moveEffects = newMoveEffectTable<T>();
        const factory = new MarkListFactory<T>(moveEffects);
        const iter = new StackyIterator(change.change);
        while (!iter.done) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const preSplit = iter.pop()!;
            const splitMarks = applyMoveEffectsToMark(
                preSplit,
                undefined,
                moveEffects,
                genId,
                false,
                false,
            );

            const mark = splitMarks[0];
            for (let i = splitMarks.length - 1; i >= 0; i--) {
                iter.push(splitMarks[i]);
                moveEffects.validatedMarks.add(splitMarks[i]);
            }
            iter.pop();
            const cloned = clone(mark);
            if (isReattach(cloned)) {
                let remainder: Reattach<T> = cloned;
                for (let i = 1; i < cloned.count; ++i) {
                    const [head, tail] = splitMarkOnOutput(remainder, 1, genId, moveEffects, true);
                    this.updateMark(head, moveEffects);
                    factory.push(head);
                    remainder = tail;
                }
                this.updateMark(remainder, moveEffects);
                factory.push(remainder);
            } else {
                factory.push(cloned);
            }
        }

        // We may need to apply the effects of updateMoveSrcDetacher for some marks if those were located
        // before their corresponding detach mark.
        const factory2 = new MarkListFactory<T>(moveEffects);
        for (const mark of factory.list) {
            const splitMarks = applyMoveEffectsToMark(
                mark,
                undefined,
                moveEffects,
                genId,
                false,
                false,
            );
            factory2.push(...splitMarks);
        }
        return {
            ...change,
            change: factory2.list,
        };
    }

    private updateMark(mark: Reattach<unknown>, moveEffects: MoveEffectTable<unknown>): void {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const original = { rev: mark.detachedBy!, index: mark.detachIndex };
        const updated = this.getUpdatedDetach(original);
        if (updated.rev !== original.rev || updated.index !== original.index) {
            mark.detachedBy = updated.rev;
            mark.detachIndex = updated.index;
            if (mark.type === "ReturnTo") {
                updateMoveSrcDetacher(moveEffects, mark.id, mark.detachedBy);
            }
        }
    }

    private getUpdatedDetach(detach: DetachedNode): DetachedNode {
        let curr = detach;
        for (const eq of this.equivalences) {
            if (curr.rev === eq.old.rev && curr.index === eq.old.index) {
                curr = eq.new;
            }
        }
        return curr;
    }
}

export function areRebasable(a: Changeset<unknown>, b: Changeset<unknown>): boolean {
    const indexToReattach: Map<number, string[]> = new Map();
    const reattachToIndex: Map<string, number> = new Map();
    let index = 0;
    for (const mark of a) {
        if (isActiveReattach(mark)) {
            const list = getOrAddEmptyToMap(indexToReattach, index);
            for (let i = 0; i < mark.count; ++i) {
                const entry = {
                    rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
                    index: mark.detachIndex + i,
                };
                const key = `${entry.rev}|${entry.index}`;
                assert(
                    !reattachToIndex.has(key),
                    "First changeset as inconsistent characterization of detached nodes",
                );
                list.push(key);
                reattachToIndex.set(key, index);
            }
        }
        index += getInputLength(mark);
    }
    index = 0;
    let listIndex = 0;
    for (const mark of b) {
        if (isActiveReattach(mark)) {
            const list = getOrAddEmptyToMap(indexToReattach, index);
            for (let i = 0; i < mark.count; ++i) {
                const entry = {
                    rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
                    index: mark.detachIndex + i,
                };
                const key = `${entry.rev}|${entry.index}`;
                const indexInA = reattachToIndex.get(key);
                if (indexInA !== undefined && indexInA !== index) {
                    // change b tries to reattach the same content as change a but in a different location
                    return false;
                }
                if (list.includes(key)) {
                    while (list[listIndex] !== undefined && list[listIndex] !== key) {
                        ++listIndex;
                    }
                    if (list.slice(0, listIndex).includes(key)) {
                        // change b tries to reattach the same content as change a but in a different order
                        return false;
                    }
                }
            }
        }
        const inputLength = getInputLength(mark);
        if (inputLength > 0) {
            listIndex = 0;
        }
        index += inputLength;
    }
    return true;
}

export function areComposable(changes: TaggedChange<Changeset<unknown>>[]): boolean {
    const tracker = new DetachedNodeTracker();
    for (const change of changes) {
        if (!tracker.isApplicable(change.change)) {
            return false;
        }
        tracker.apply(change);
    }
    return true;
}
