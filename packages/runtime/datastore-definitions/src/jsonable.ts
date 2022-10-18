/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Used to constrain a type `T` to types that are serializable as JSON.
 * Produces a compile-time error if `T` contains non-Jsonable members.
 *
 * @remarks
 * Note that this does NOT prevent using of values with non-json compatible data,
 * it only prevents using values with types that include non-json compatible data.
 * This means that one can, for example, pass an a value typed with json compatible
 * interface into this function,
 * that could actually be a class with lots on non-json compatible fields and methods.
 *
 * Important: `T extends Jsonable<T>` is incorrect (does not even compile).
 * `T extends Jsonable` is also incorrect since `Jsonable` is just `any` and thus applies no constraint at all.
 *
 * The optional 'TReplaced' parameter may be used to permit additional leaf types to support
 * situations where a `replacer` is used to handle special values (e.g., `Jsonable<{ x: IFluidHandle }, IFluidHandle>`).
 *
 * Note that `Jsonable<T>` does not protect against the following pitfalls when serializing with JSON.stringify():
 *
 * - `undefined` properties on objects are omitted (i.e., properties become undefined instead of equal to undefined).
 *
 * - When `undefined` appears as the root object or as an array element it is coerced to `null`.
 *
 * - Non-finite numbers (`NaN`, `+/-Infinity`) are also coerced to `null`.
 *
 * - prototypes and non-enumerable properties are lost.
 *
 * Also, `Jsonable<T>` does not prevent the construction of circular references.
 *
 * Using `Jsonable` (with no type parameters) or `Jsonable<any>` is just a type alias for `any`
 * and should not be used if type safety is desired.
 *
 * @example
 * Typical usage:
 * ```ts
 *      function foo<T>(value: Jsonable<T>) { ... }
 * ```
 */
export type Jsonable<T = any, TReplaced = void> =
    T extends undefined | null | boolean | number | string | TReplaced
        ? T
        // eslint-disable-next-line @typescript-eslint/ban-types
        : Extract<T, Function> extends never
            ? {
                [K in keyof T]: Extract<K, symbol> extends never
                    ? Jsonable<T[K], TReplaced>
                    : never
            }
            : never;
