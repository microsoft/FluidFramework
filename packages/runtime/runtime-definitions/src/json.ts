/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Do not use capital 'I' for JsonObject<T> and JsonArray<T> as the use of interfaces is
// a workaround for lack of type recursion.
// tslint:disable:interface-name

export type JsonPrimitive = undefined | null | boolean | number | string;
export interface JsonObject<T> extends Record<string, Json<T>> { }
export interface JsonArray<T> extends Array<Json<T>> { }

/**
 * Used to constrain a value to types that are serializable as JSON.  The `T` type parameter may be used to
 * customize the type of the leaves to support situations where a `replacer` is used to handle special values.
 * (e.g., `Json<JsonPrimitive | IComponentHandle>`)
 *
 * Note that the Json type does not protect against the following pitfalls when serializing `undefined` and
 * non-finite numbers:
 *
 *  - `undefined` properties on objects are omitted (i.e., properties become undefined instead of equal to undefined).
 *  - When `undefined` appears as the root object or as an array element it is coerced to `null`.
 *  - Non-finite numbers (`NaN`, `+/-Infinity`) are also coerced to `null`.
 *  - (`null` always serializes as `null`.)
 */
export type Json<T = JsonPrimitive> = T | JsonArray<T> | JsonObject<T>;
