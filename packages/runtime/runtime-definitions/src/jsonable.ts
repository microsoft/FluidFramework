/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Do not use capital 'I' for JsonObject<T> and JsonArray<T> as the use of interfaces is
// a workaround for lack of type recursion.
export type JsonablePrimitive = undefined | null | boolean | number | string;
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface JsonableObject<T> extends Record<string, Jsonable<T>> { }
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface JsonableArray<T> extends Array<Jsonable<T>> { }

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
export type Jsonable<T = JsonablePrimitive> = T | JsonableArray<T> | JsonableObject<T>;
