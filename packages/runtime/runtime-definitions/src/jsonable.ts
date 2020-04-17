/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export type JsonablePrimitive = undefined | null | boolean | number | string;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type JsonableObject<T> = {
    [key: string]: Jsonable<T>
    [key: number]: Jsonable<T>
};

export type JsonableArray<T> = Jsonable<T>[];

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

/**
 * Take a type, usually and interface and tries to map it to a compatible jsonable type.
 * It will produce an type that all all properites as never if the type can't be converted
 * to a jsonable, this should result in a compile time error.
 * The usage looks like `foo<T extends any = Jsonable>(input: AsJsonable<T>)`
 * if T isn't jsonable then all values of input will be invalid,
 * as all the properties will need to be never
 * which isn't possible.
 */
export type AsJsonable<T extends any, J = JsonablePrimitive> =
    T extends Jsonable ? T : {[K in keyof T]: T[K] extends AsJsonable<T[K]> ? Jsonable<J> : never };
