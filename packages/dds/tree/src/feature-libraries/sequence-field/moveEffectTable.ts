/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { clone, fail } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
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
    srcEffects: Map<MoveId, MoveEffect<T>>;
    dstEffects: Map<MoveId, MoveEffect<T>>;
}

export interface MoveEffect<T> {
    id?: MoveId;
    count?: number;
    child?: MoveId;
    mergeLeft?: MoveId;
    mergeRight?: MoveId;
    mark?: Mark<T>;
    modifyAfter?: T;
    movedMark?: Mark<T>;
}

export function newMoveEffectTable<T>(): MoveEffectTable<T> {
    return {
        srcEffects: new Map(),
        dstEffects: new Map(),
    };
}

export enum MoveEnd {
    Source,
    Dest,
}

function getTable<T>(table: MoveEffectTable<T>, end: MoveEnd): Map<MoveId, MoveEffect<T>> {
    return end === MoveEnd.Source ? table.srcEffects : table.dstEffects;
}

export function splitMove<T>(
    effects: MoveEffectTable<T>,
    end: MoveEnd,
    id: MoveId,
    newId: MoveId,
    count1: number,
    count2: number,
): void {
    const table = getTable(effects, end);
    let effect = table.get(id);
    if (effect === undefined) {
        effect = {
            count: count1 + count2,
        };
        table.set(id, effect);
    }

    const newEffect: MoveEffect<T> = {
        count: count2,
        child: effect.child,
    };

    effect.child = newId;
    effect.count = count1;
    table.set(newId, newEffect);
}

export function getOrCreateEffect<T>(
    moveEffects: MoveEffectTable<T>,
    end: MoveEnd,
    id: MoveId,
): MoveEffect<T> {
    const table = getTable(moveEffects, end);
    let effect = table.get(id);
    if (effect === undefined) {
        effect = {};
        table.set(id, effect);
    }
    return effect;
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

function applyMoveEffectsToDest<T>(
    mark: MoveIn | ReturnTo,
    effects: MoveEffectTable<T>,
    consumeEffect: boolean,
): Mark<T>[] {
    const effect = getOrCreateEffect(effects, MoveEnd.Dest, mark.id);
    const result: Mark<T>[] = [];

    assert(effect.modifyAfter === undefined, "Cannot modify move destination");
    if (effect.mark !== undefined) {
        result.push(effect.mark);
    } else {
        if (effect.count !== 0) {
            result.push({
                ...mark,
                id: effect.id ?? mark.id,
                count: effect.count ?? mark.count,
            });
        }
    }

    if (effect.child !== undefined) {
        const childEffect = getOrCreateEffect(effects, MoveEnd.Dest, effect.child);
        assert(childEffect.count !== undefined, "Child effects should have size");
        result.push({
            ...mark,
            id: effect.child,
            count: childEffect.count,
        });
    }

    if (consumeEffect) {
        delete effect.mark;
        delete effect.count;
        delete effect.id;
        delete effect.child;
    }
    return result;
}

function applyMoveEffectsToSource<T>(
    mark: MoveOut<T> | ReturnFrom<T>,
    effects: MoveEffectTable<T>,
    consumeEffect: boolean,
    composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
    const effect = getOrCreateEffect(effects, MoveEnd.Source, mark.id);
    const result: Mark<T>[] = [];
    if (effect.mark !== undefined) {
        result.push(effect.mark);
    } else if (effect.count !== 0) {
        const newMark = clone(mark);
        newMark.id = effect.id ?? newMark.id;
        newMark.count = effect.count ?? newMark.count;
        if (effect.modifyAfter !== undefined) {
            assert(
                composeChildren !== undefined,
                "Must provide a change composer if modifying moves",
            );
            const changes = composeChildren(newMark.changes, effect.modifyAfter);
            if (changes !== undefined) {
                newMark.changes = changes;
            } else {
                delete newMark.changes;
            }
        }
        result.push(newMark);
    }

    if (effect.child !== undefined) {
        const childEffect = getOrCreateEffect(effects, MoveEnd.Source, effect.child);
        assert(childEffect.count !== undefined, "Child effects should have size");
        result.push({
            ...mark,
            id: effect.child,
            count: childEffect.count,
        });
    }

    if (consumeEffect) {
        delete effect.mark;
        delete effect.count;
        delete effect.id;
        delete effect.child;
    }
    return result;
}

export function applyMoveEffectsToMark<T>(
    mark: Mark<T>,
    effects: MoveEffectTable<T>,
    consumeEffect: boolean,
    composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
    if (isMoveMark(mark)) {
        const type = mark.type;
        switch (type) {
            case "MoveOut":
            case "ReturnFrom": {
                return applyMoveEffectsToSource(mark, effects, consumeEffect, composeChildren);
            }
            case "MoveIn":
            case "ReturnTo": {
                return applyMoveEffectsToDest(mark, effects, consumeEffect);
            }
            default:
                unreachableCase(type);
        }
    }
    return [mark];
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
            splitMove(moveEffects, MoveEnd.Dest, mark.id, newId, length, remainder);
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
            splitMove(moveEffects, MoveEnd.Source, markObj.id, newId, length, remainder);
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
