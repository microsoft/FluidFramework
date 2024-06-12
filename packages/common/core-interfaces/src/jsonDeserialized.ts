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
 * To manage recursive types, after a limited number of recursions, the
 * remaining type is replaced with JsonTypeWith<TReplaced>.
 *
 * @beta
 */
export type JsonDeserialized<T, TReplaced = never> = JsonDeserializedImpl<T, TReplaced>;
