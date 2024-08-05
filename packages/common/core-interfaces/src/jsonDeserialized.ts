/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";

/**
 * Options for {@link JsonDeserialized}.
 *
 * @beta
 */
export interface JsonDeserializedOptions {
	/**
	 * Exact types that are managed by custom deserialization logic (beyond
	 * {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse|JSON.parse}
	 * without a reviver). Only exact types matching specification will be
	 * preserved unaltered.
	 *
	 * The default value is `never`.
	 */
	AllowExactly?: unknown;

	/**
	 * General types that are managed by custom deserialization logic (beyond
	 * {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse|JSON.parse}
	 * without a reviver). Any type satisfying specification will be preserved
	 * unaltered.
	 *
	 * The default value is `never`.
	 */
	AllowExtensionOf?: unknown;
}

/**
 * Produces a type that results from a type `T` serialized and deserialized
 * through JSON using {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}
 * (without replacer) and {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse|JSON.parse}
 * (reviver), respectively as base model.
 *
 * @typeParam T - The type that was serialized.
 * @typeParam Options - Options for the filter. See {@link JsonDeserializedOptions}.
 *
 * @remarks
 * This filter can be used to derive the expected type of a JSON deserialized
 * value whether or not the type of value serialized meets serialization
 * constraints (see {@link JsonSerializable} including serialization pitfalls).
 *
 * When used as a filter to inferred generic `T`, a compile-time error can be
 * produced trying to assign `JsonDeserialized<T>` to `T`.
 *
 * Simply deserialized JSON never contains `bigint`, `undefined`, `symbol`,
 * or function values.
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
 * times (currently 4) and then further instances of recursion are replaced with
 * {@link JsonTypeWith|JsonTypeWith<Options.AllowExactly "or" Options.AllowExtensionOf>}.
 *
 * Under basic serialization, class instances become simple data objects that
 * lose hidden properties and prototypes that are required for `instanceof`
 * runtime checks.
 *
 * The optional 'Options.AllowExactly' and 'Options.AllowExtensionOf'
 * parameters may be used to permit additional leaf types handled by custom
 * serialization/deserialization logic.
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
	Options extends JsonDeserializedOptions = {
		AllowExactly: never;
		AllowExtensionOf: never;
	},
> = InternalUtilityTypes.JsonDeserializedImpl<T, Options>;
