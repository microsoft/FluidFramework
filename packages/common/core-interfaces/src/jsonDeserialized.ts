/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalUtilityTypes } from "./exposedInternalUtilityTypes.js";

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
 * (without reviver), respectively as base model.
 *
 * @typeParam T - The type that was serialized.
 * @typeParam Options - Options for the filter. See {@link JsonDeserializedOptions}.
 *
 * @remarks
 * Before adding use of this utility type, consider using a utility like
 * {@link https://github.com/sinclairzx81/typebox#readme | TypeBox} that allows
 * for runtime validation.
 *
 * This filter can be used to derive the expected type of a JSON deserialized
 * value whether or not the type of value serialized meets serialization
 * constraints (see {@link JsonSerializable} including serialization pitfalls).
 *
 * When used as a filter to inferred generic `T`, a compile-time error can be
 * produced trying to assign `JsonDeserialized<T>` to `T`.
 *
 * Simply deserialized JSON never contains `bigint`, `undefined`, `symbol`,
 * or function values. (Object properties which had those types before encoding
 * are omitted during serialization and thus won't be present after
 * deserialization.) Therefore, through this filter, such properties:
 *
 * - become optional with those types excluded (when there are other supported
 * types in union)
 *
 * - are removed (when nothing else in union is supported)
 *
 * - in an array are (1) replaced with `null` if `undefined`, `symbol`, and
 * function values or (2) simply removed (become `never`) if `bigint` value as
 * serialization attempts will throw.
 *
 * Examples results:
 *
 * | Before serialization  | After deserialization | After in record    |       After in array |
 * | --------------------- | --------------------- | ------------------ | --------------------:|
 * | `undefined \| number` | `number`              | `prop?: number`    | `(number \| null)[]` |
 * | `symbol \| number`    | `number`              | `prop?: number`    | `(number \| null)[]` |
 * | `bigint \| number`    | `number`              | `prop: number`     |           `number[]` |
 * | `undefined`           | N/A `never`           | (prop not present) |             `null[]` |
 * | `symbol`              | N/A `never`           | (prop not present) |             `null[]` |
 * | `bigint`              | N/A `never`           | N/A (prop not present) |    N/A `never[]` |
 * | `bigint \| symbol`    | N/A `never`           | (prop not present) |             `null[]` |
 * | `bigint \| number \| symbol` | `number`       | `prop?: number`    | `(number \| null)[]` |
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
 * @example Example usage
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
