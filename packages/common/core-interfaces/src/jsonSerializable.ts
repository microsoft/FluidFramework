/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";

/**
 * Used to constrain a type `T` to types that are serializable as JSON.
 *
 * Under typical use a compile-time error is produced if `T` contains
 * non-JsonSerializable members.
 *
 * @remarks
 * Note that this does NOT prevent use of values with non-JSON compatible data,
 * it only prevents using values with types that include non-JSON compatible data.
 * This means that one can, for example, pass in a value typed with JSON compatible
 * interface into this filter, that could actually be a class with lots on non-JSON
 * compatible fields and methods.
 *
 * Important: `T extends JsonSerializable<T>` is incorrect (does not even compile).
 *
 * The optional `Options.Replaced` parameter may be used to permit additional leaf types
 * to support situations where a `replacer` is used to handle special values (e.g.,
 * `JsonSerializable<{ x: IFluidHandle }, { Replaced: IFluidHandle }>`).
 *
 * Note that `JsonSerializable<T>` does not protect against the following pitfalls
 * when serializing with JSON.stringify():
 *
 * - Non-finite numbers (`NaN`, `+/-Infinity`) are coerced to `null`.
 *
 * - prototypes and non-enumerable properties are lost.
 *
 * - `ArrayLike` types that are not arrays and are serialized as `{ length: number }`.
 *
 * - getter and setters properties are lost. (Though appear supported.)
 *
 * Also, `JsonSerializable<T>` does not prevent the construction of circular references.
 *
 * Specifying `JsonSerializable<unknown>` or `JsonSerializable<any>` yields a type
 * alias for {@link JsonTypeWith}`<never>` and should not be used if precise type
 * safety is desired.
 *
 * Class instances are indistinguishable from general objects by type checking
 * unless they have non-public members.
 * Unless `Option.IgnoreInaccessibleMembers` is used, types with non-public
 * members will result in {@link SerializationErrorPerNonPublicProperties}.
 * When `Option.IgnoreInaccessibleMembers` is `ignore-inaccessible-members`,
 * non-public (non-function) members are preserved without error, but they are
 * filtered away by the type filters and thus produce an incorrectly narrowed
 * type compared to actual data. Though such a result may be customer desired.
 *
 * Perhaps a https://github.com/microsoft/TypeScript/issues/22677 fix will
 * enable better support.
 *
 * @example Typical usage
 *
 * ```typescript
 * function foo<T>(value: JsonSerializable<T>) { ... }
 * ```
 *
 * @privateRemarks
 * Upon recursion, the original type T is preserved intact. This is done to prevent
 * infinite recursion and produces a technically incorrect result type. However, with
 * proper use, that will never be an issue as any filtering of types will happen
 * before T recursion.
 * To accomplish this behavior, during recursion type `T` is unioned with `TReplaced`.
 *
 * @beta
 */
export type JsonSerializable<
	T,
	Options extends {
		Replaced: unknown;
		IgnoreInaccessibleMembers?: "ignore-inaccessible-members";
	} = {
		Replaced: never;
	},
> = InternalUtilityTypes.JsonSerializableImpl<T, Options>;
