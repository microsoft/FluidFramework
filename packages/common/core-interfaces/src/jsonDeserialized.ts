/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonDeserializedImpl } from "./exposedUtilityTypes.js";

/**
 * Used to constrain a type `T` to types that are deserializable from JSON.
 *
 * When used as a filter to inferred generic `T`, a compile-time error can be
 * produced trying to assign `JsonDeserialized<T>` to `T`.
 *
 * Deserialized JSON never contains `undefined` values, so properties with
 * `undefined` values become optional. If the original property was not already
 * optional, then compilation of assignment will fail.
 *
 * Similarly, function, symbol, and bigint valued properties are removed.
 *
 * Setter and getter properties become value properties.
 *
 * Recursive types without any transformation are preserved intact. Recursive
 * types that require modification are unrolled a limited number of times and
 * then instances of recursion are replaced with JsonTypeWith<TReplaced>.
 *
 * Class instances become simple data objects and lose prototype that allows
 * `instanceof` runtime checks.
 *
 * @remarks
 * Class instances are indistinguishable from general objects by type checking
 * unless they have non-public members.
 * Unless option is used to `ignore-inaccessible-members` types with non-public
 * members will result in {@link DeserializationErrorPerNonPublicProperties}.
 * When `ignore-inaccessible-members` is enabled, non-public (non-function)
 * members are preserved, but they are filtered away by the type filters and
 * thus produce an incorrectly narrowed type compared to actual data. Though
 * such a result may be customer desired.
 *
 * Perhaps a https://github.com/microsoft/TypeScript/issues/22677 fix will
 * enable better support.
 *
 * @beta
 */
export type JsonDeserialized<T, TReplaced = never> = JsonDeserializedImpl<T, TReplaced>;
