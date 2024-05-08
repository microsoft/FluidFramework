/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FlattenIntersection,
	IsEnumLike,
	IsExactlyObject,
	NonSymbolWithOptionalPropertyOf,
	NonSymbolWithRequiredPropertyOf,
} from "./exposedUtilityTypes.js";

/**
 * Type constraint for types that are likely serializable as JSON or have a custom
 * alternate type.
 *
 * @remarks
 * Use `JsonableTypeWith<never>` for just JSON serializable types.
 * See {@link Jsonable} for serialization pitfalls.
 *
 * @privateRemarks
 * Perfer using `Jsonable<unknown>` over this type that is an implementation detail.
 * @alpha
 */
export type JsonableTypeWith<T> =
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| boolean
	| number
	| string
	| T
	| { [key: string | number]: JsonableTypeWith<T> }
	| JsonableTypeWith<T>[];

/**
 * Filters a type `T` to types for undefined that is not viable in an array (or tuple) that
 * must go through JSON serialization.
 * If `T` is `undefined`, then an error literal string type is returned with hopes of being
 * informative. When result is unioned with `string`, then the error string will be eclipsed
 * by the union. In that case undefined will still not be an option, but source of the error
 * may be harder to discover.
 *
 * @remarks As a special case to deal with infinite recursion, if give T is exactly the same
 * type as its parent (containing) type, then just use the parent type as-is. It is assumed
 * that any unsupported aspects will be flagged in other branches of Jsonable filtering.
 *
 * @alpha
 */
export type Internal_JsonableForArrayItem<T, TReplaced, TParent> =
	// Some initial filtering must be provided before a test for undefined.
	// These tests are expected to match those in JsonEncodable/JsonDecodable.
	/* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ JsonableTypeWith<TReplaced>
		: /* test for 'unknown' */ unknown extends T
		? /* 'unknown' => */ JsonableTypeWith<TReplaced>
		: /* test for Jsonable primitive types */ T extends  // eslint-disable-next-line @rushstack/no-new-null
				| null
				| boolean
				| number
				| string
				| TReplaced
		? /* primitive types => */ T
		: /* test for undefined possibility */ undefined extends T
		? /* undefined | ... => */ "error-array-or-tuple-may-not-allow-undefined-value-consider-null"
		: /* test for identical parent */ (<G>() => G extends T ? 1 : 2) extends <
				G,
		  >() => G extends TParent ? 1 : 2
		? /* identical */ TParent
		: /* different */ Jsonable<T, TReplaced>;

/**
 * Used to constrain a type `T` to types that are serializable as JSON.
 * Produces a compile-time error if `T` contains non-Jsonable members.
 *
 * @remarks
 * Note that this does NOT prevent using of values with non-json compatible data,
 * it only prevents using values with types that include non-json compatible data.
 * This means that one can, for example, pass in a value typed with json compatible
 * interface into this function,
 * that could actually be a class with lots on non-json compatible fields and methods.
 *
 * Important: `T extends Jsonable<T>` is incorrect (does not even compile).
 *
 * The optional 'TReplaced' parameter may be used to permit additional leaf types to support
 * situations where a `replacer` is used to handle special values (e.g., `Jsonable<{ x: IFluidHandle }, IFluidHandle>`).
 *
 * Note that `Jsonable<T>` does not protect against the following pitfalls when serializing with JSON.stringify():
 *
 * - Non-finite numbers (`NaN`, `+/-Infinity`) are coerced to `null`.
 *
 * - prototypes and non-enumerable properties are lost.
 *
 * - `ArrayLike` types that are not arrays and are serialized as `{ length: number }`.
 *
 * Also, `Jsonable<T>` does not prevent the construction of circular references.
 *
 * Using `Jsonable<unknown>` or `Jsonable<any>` is a type alias for
 * {@link JsonableTypeWith}`<never>` and should not be used if precise type safety is desired.
 *
 * @example Typical usage
 *
 * ```typescript
 * function foo<T>(value: Jsonable<T>) { ... }
 * ```
 * @alpha
 */
export type Jsonable<T, TReplaced = never> = /* test for 'any' */ boolean extends (
	T extends never ? true : false
)
	? /* 'any' => */ JsonableTypeWith<TReplaced>
	: /* test for 'unknown' */ unknown extends T
	? /* 'unknown' => */ JsonableTypeWith<TReplaced>
	: /* test for JSON Encodable primitive types or given alternate */ T extends  // eslint-disable-next-line @rushstack/no-new-null
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
					[K in keyof T]: Internal_JsonableForArrayItem<T[K], TReplaced, T>;
			  }
			: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
			? /* `object` => */ JsonableTypeWith<TReplaced>
			: /* test for enum like types */ IsEnumLike<T> extends true
			? /* enum or similar simple type (return as-is) => */ T
			: /* property bag => */ FlattenIntersection<
					{
						/* required properties are recursed and may not have undefined values. */
						[K in NonSymbolWithRequiredPropertyOf<T>]-?: undefined extends T[K]
							? "error-required-property-may-not-allow-undefined-value"
							: Jsonable<T[K], TReplaced>;
					} & {
						/* optional properties are recursed and allowed to preserve undefined value type. */
						[K in NonSymbolWithOptionalPropertyOf<T>]?: Jsonable<
							T[K],
							TReplaced | undefined
						>;
					} & {
						/* symbol properties are rejected */
						[K in keyof T & symbol]: never;
					}
			  >
		: /* not an object => */ never
	: /* function => */ never;
