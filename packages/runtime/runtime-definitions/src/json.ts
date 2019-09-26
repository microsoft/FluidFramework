/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Do not use capital 'I' for JsonObject<T> and JsonArray<T> as the use of interfaces is
// a workaround for lack of type recursion.
// tslint:disable:interface-name

export type JsonPrimitive = undefined | null | boolean | number | string;
export interface JsonObject<T> extends Record<string, T | JsonArray<T> | JsonObject<T>> { }
export interface JsonArray<T> extends Array<T | JsonObject<T> | JsonArray<T>> { }

/**
 * Used to constrain a value to types that are serializable as JSON.  The `T` type parameter may be used to
 * customize the type of the leaves to support situations where a `replacer` is used to handle special values.
 * (e.g., Json<JsonPrimitive | IComponentHandle>)
 *
 * Note that the Json type does not protect against the following pitfalls when marshalling `undefined` and
 * non-finite numbers:
 *
 *  - `undefined` properties on objects are omitted (i.e., properties become undefined instead equal to undefined).
 *  - `undefined` is coerced to `null` when marshalling an `undefined` root or array element.
 *  - Non-finite numbers (NaN, +/-Infinity) are coerced to `null`.
 *  - (null always marshalls as null)
 */
export type Json<T = JsonPrimitive> = T | JsonArray<T> | JsonObject<T>;
