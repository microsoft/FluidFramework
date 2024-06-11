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
	NonSymbolWithOptionalPropertyOf,
	NonSymbolWithRequiredPropertyOf,
} from "./exposedUtilityTypes.js";
import type { JsonTypeWith } from "./jsonType.js";

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
export type JsonSerializable<T, TReplaced = never> = /* test for 'any' */ boolean extends (
	T extends never ? true : false
)
	? /* 'any' => */ JsonTypeWith<TReplaced>
	: /* test for 'unknown' */ unknown extends T
	? /* 'unknown' => */ JsonTypeWith<TReplaced>
	: /* test for JSON Encodable primitive types or given alternate */ T extends
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
						JsonSerializable<T[K], TReplaced | T>
					>;
			  }
			: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
			? /* `object` => */ JsonTypeWith<TReplaced>
			: /* test for enum like types */ IsEnumLike<T> extends true
			? /* enum or similar simple type (return as-is) => */ T
			: /* property bag => */ FlattenIntersection<
					{
						/* required properties are recursed and may not have undefined values. */
						[K in NonSymbolWithRequiredPropertyOf<T>]-?: undefined extends T[K]
							? { ["error required property may not allow undefined value"]: never }
							: JsonSerializable<T[K], TReplaced | T>;
					} & {
						/* optional properties are recursed and allowed to preserve undefined value type. */
						[K in NonSymbolWithOptionalPropertyOf<T>]?: JsonSerializable<
							T[K],
							TReplaced | T | undefined
						>;
					} & {
						/* symbol properties are rejected */
						[K in keyof T & symbol]: never;
					}
			  >
		: /* not an object => */ never
	: /* function => */ never;
