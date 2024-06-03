/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import type {
	FlattenIntersection,
	IsEnumLike,
	IsExactlyObject,
	JsonForArrayItem,
	NonSymbolWithDefinedNonFunctionPropertyOf,
	NonSymbolWithPossiblyUndefinedNonFunctionPropertyOf,
} from "./exposedUtilityTypes.js";
import type { JsonTypeWith } from "./jsonType.js";

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
 * Similarly, function valued properties are removed.
 *
 * @beta
 */
export type JsonDeserialized<T, TReplaced = never> = /* test for 'any' */ boolean extends (
	T extends never ? true : false
)
	? /* 'any' => */ JsonTypeWith<TReplaced>
	: /* test for 'unknown' */ unknown extends T
	? /* 'unknown' => */ JsonTypeWith<TReplaced>
	: /* test for deserializable primitive types or given alternate */ T extends
			| null
			| boolean
			| number
			| string
			| TReplaced
	? /* primitive types => */ T
	: // eslint-disable-next-line @typescript-eslint/ban-types
	/* test for not a function */ Extract<T, Function> extends never
	? /* not a function => test for object */ T extends object
		? /* object => test for array */ T extends readonly (infer _)[]
			? /* array => */ {
					/* array items may not not allow undefined */
					/* use homomorphic mapped type to preserve tuple type */
					[K in keyof T]: JsonForArrayItem<
						T[K],
						TReplaced,
						JsonDeserialized<T[K], TReplaced>
					>;
			  }
			: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
			? /* `object` => */ JsonTypeWith<TReplaced>
			: /* test for enum like types */ IsEnumLike<T> extends true
			? /* enum or similar simple type (return as-is) => */ T
			: /* property bag => */ FlattenIntersection<
					/* properties with symbol keys or function values are removed */
					{
						/* properties with defined values are recursed */
						[K in NonSymbolWithDefinedNonFunctionPropertyOf<T>]: JsonDeserialized<
							T[K],
							TReplaced
						>;
					} & {
						/* properties that may have undefined values are optional */
						[K in NonSymbolWithPossiblyUndefinedNonFunctionPropertyOf<T>]?: JsonDeserialized<
							T[K],
							TReplaced
						>;
					}
			  >
		: /* not an object => */ never
	: /* function => */ never;
