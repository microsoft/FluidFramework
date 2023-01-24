/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Named } from "../../../core";

/**
 * Utilities for manipulating types.
 */

/**
 * Convert a object type into the type of a ReadonlyMap from field name to value.
 */
export type ObjectToMap<ObjectMap, MapKey extends number | string, MapValue> = ReadonlyMap<
    MapKey,
    MapValue
> & {
    get<TKey extends keyof ObjectMap>(key: TKey): ObjectMap[TKey];
};

/**
 * Takes in a list of strings, and returns an object with those strings as keys.
 */
export type ListToKeys<T extends readonly string[], TValue> = {
    [key in T[number]]: TValue;
};

/**
 * Replaces undefined and unknown with a default value.
 * Handling of `unknown` this way is required to make this work with optional fields,
 * since they seem to infer the `unknown` type, not undefined.
 */
export type WithDefault<T, Default> = T extends undefined
    ? Default
    : unknown extends T
    ? Default
    : T;

/**
 * Replaces undefined with a default value.
 */
export type AsNames<T extends readonly (string | Named<string>)[]> = {
    readonly [Index in keyof T]: T[Index] extends string
        ? T[Index]
        : T[Index] extends Named<string>
        ? T[Index]["name"]
        : string; // This case should not be needed, but gets used in generic code for some reason.
};
