/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";

/**
 * Produces a type that results from a type `T` serialized and deserialized
 * through JSON.
 *
 * @remarks
 * When used as a filter to inferred generic `T`, a compile-time error can be
 * produced trying to assign `JsonDeserialized<T>` to `T`.
 *
 * Deserialized JSON never contains `undefined`, `symbol`, or function values.
 * Object properties with values of those types are absent. So properties
 * become optional (when there are other supported types in union) or are
 * removed (when nothing else in union is supported).
 * In an array, such values are replaced with `null`.
 *
 * `bigint` valued properties are simply removed as serialization attempts
 * will throw.
 *
 * Setter and getter properties become value properties after filtering
 * although no data will be persisted assuming those properties are backed
 * by functions. If an implementation of getter/setter interface uses a
 * simple data member (of supported type), that will persist.
 *
 * Recursive types without any required modification are preserved intact.
 * Recursive types that require modification are unrolled a limited number of
 * times and then further instances of recursion are replaced with
 * {@link JsonTypeWith|JsonTypeWith<Options.Replaced>}.
 *
 * Under basic serialization, class instances become simple data objects that
 * lose hidden properties and prototypes that are required for `instanceof`
 * runtime checks.
 *
 * The optional 'Options.Replaced' parameter may be used to permit additional
 * leaf types handled by custom serialization/deserialization logic.
 *
 * @example Typical usage
 *
 * ```typescript
 * function foo<T>(): JsonDeserialized<T> { ... }
 * ```
 *
 * @beta
 */
export type JsonDeserialized<
	T,
	Options extends {
		Replaced: unknown;
	} = {
		Replaced: never;
	},
> = InternalUtilityTypes.JsonDeserializedImpl<T, Options["Replaced"]>;
