/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import type { JsonSerializableImpl } from "./exposedUtilityTypes.js";

/**
 * Used to constrain a type `T` to types that are serializable as JSON.
 * Produces a compile-time error if `T` contains non-JsonSerializable members.
 *
 * @remarks
 * Note that this does NOT prevent using of values with non-json compatible data,
 * it only prevents using values with types that include non-json compatible data.
 * This means that one can, for example, pass in a value typed with json compatible
 * interface into this function,
 * that could actually be a class with lots on non-json compatible fields and methods.
 *
 * Important: `T extends JsonSerializable<T>` is incorrect (does not even compile).
 *
 * The optional 'TReplaced' parameter may be used to permit additional leaf types to support
 * situations where a `replacer` is used to handle special values (e.g., `JsonSerializable<{ x: IFluidHandle }, IFluidHandle>`).
 *
 * Note that `JsonSerializable<T>` does not protect against the following pitfalls when serializing with JSON.stringify():
 *
 * - Non-finite numbers (`NaN`, `+/-Infinity`) are coerced to `null`.
 *
 * - prototypes and non-enumerable properties are lost.
 *
 * - `ArrayLike` types that are not arrays and are serialized as `{ length: number }`.
 *
 * Also, `JsonSerializable<T>` does not prevent the construction of circular references.
 *
 * Using `JsonSerializable<unknown>` or `JsonSerializable<any>` is a type alias for
 * {@link JsonTypeWith}`<never>` and should not be used if precise type safety is desired.
 *
 * @example Typical usage
 *
 * ```typescript
 * function foo<T>(value: JsonSerializable<T>) { ... }
 * ```
 *
 * @privateRemarks
 * Upon recursion, the original type T is preserved intact. This is done to prevent
 * infinite recursion and produces a technically incorrect result type. However with that
 * proper use that will never be an issue as any filtering of types will happen before T
 * recursion.
 * To accomplish this behavior `TReplaced` during recursion is unioned with type `T`.
 *
 * @beta
 */
export type JsonSerializable<T, TReplaced = never> = JsonSerializableImpl<T, TReplaced>;
