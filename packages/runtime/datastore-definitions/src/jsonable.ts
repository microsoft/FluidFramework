/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Used to constrain a type 'T' to types that are JSON serializable as JSON.  Produces an
 * error if `T` contains non-Jsonable members.
 *
 * Typical usage:
 * ```ts
 *      function foo<T>(value: Jsonable<T>) { ... }
 * ```
 *
 * Important: `T extends Jsonable<T>` is a *superset* of `Jsonable<T>` and usually incorrect.
 *
 * The optional 'TReplaced' parameter may be used to permit additional leaf types to support
 * situations where a `replacer` is used to handle special values (e.g., `Jsonable<{ x: IFluidHandle }, IFluidHandle>`).
 *
 * Note that the Jsonable type does not protect against the following pitfalls when serializing
 * `undefined` and non-finite numbers:
 *
 *  - `undefined` properties on objects are omitted (i.e., properties become undefined instead of equal to undefined).
 *  - When `undefined` appears as the root object or as an array element it is coerced to `null`.
 *  - Non-finite numbers (`NaN`, `+/-Infinity`) are also coerced to `null`.
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
