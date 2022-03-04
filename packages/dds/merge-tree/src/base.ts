/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Property<TKey, TData> {
    key: TKey;
    data: TData;
}

export interface QProperty<TKey, TData> {
    key?: TKey;
    data?: TData;
}

export interface PropertyAction<TKey, TData> {

    <TAccum>(p: Property<TKey, TData>, accum?: TAccum): boolean;
}

export type ConflictAction<TKey, TData> =
    (key: TKey, currentKey: TKey, data: TData, currentData: TData) => QProperty<TKey, TData>;

export interface Dictionary<TKey, TData> {
    get(key: TKey): Property<TKey, TData> | undefined;
    put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>): void;
    remove(key: TKey): void;
    map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum): void;
}

export interface SortedDictionary<TKey, TData> extends Dictionary<TKey, TData> {
    max(): Property<TKey, TData> | undefined;
    min(): Property<TKey, TData> | undefined;
    mapRange<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey): void;
}

export interface KeyComparer<TKey> {

    (a: TKey, b: TKey): number;
}
/**
 * A range [start, end)
 */
export interface IIntegerRange {
    start: number;
    end: number;
}
