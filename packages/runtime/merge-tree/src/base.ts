/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    <TAccum>(p: Property<TKey, TData>, accum?: TAccum): boolean;
}

export type ConflictAction<TKey, TData> =
    (key: TKey, currentKey: TKey, data: TData, currentData: TData) => QProperty<TKey, TData>;

export interface Dictionary<TKey, TData> {
    get(key: TKey): Property<TKey, TData>;
    put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>);
    remove(key: TKey);
    map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum);
    diag();
}

export interface SortedDictionary<TKey, TData> extends Dictionary<TKey, TData> {
    max(): Property<TKey, TData>;
    min(): Property<TKey, TData>;
    mapRange<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey);
}

export interface KeyComparer<TKey> {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    (a: TKey, b: TKey): number;
}
/**
 * A range [start, end)
 */
export interface IIntegerRange {
    start: number;
    end: number;
}
