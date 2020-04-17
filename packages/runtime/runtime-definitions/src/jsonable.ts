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
 * Take a type, usually an interface and tries to map it to a compatible jsonable type.
 * This is basically taking advantage of duck typing. We are generating a type we know
 * is jsonable from the input type, but setting anything not serializable to never,
 * which will cause compile time issues with objects of the original type if they
 * have properties that are not jsonable.
 *
 * The usage looks like `foo<T>(input: AsJsonable<T>)`
 *
 * if T isn't jsonable then all values of input will be invalid,
 * as all the properties will need to be never which isn't possible.
 *
 * This won't be fool proof, but if someone modifies a type used in an
 * AsJsonable to add a property that isn't Jsonable, they should get a compile time
 * break, which is pretty good.
 *
 * What this type does:
 * If T is Jsonable<J>
 *      return T
 *      Else, If T is not a function,
 *          For each property K of T recursively call AsJsonable
 *          Else, return never
 */
export type AsJsonable<T, J = JsonablePrimitive> =
    T extends Jsonable<J> ?
        T :
        Extract<T, Function> extends never ?
            { [K in keyof T]: AsJsonable<T[K], J>} :
            never;
