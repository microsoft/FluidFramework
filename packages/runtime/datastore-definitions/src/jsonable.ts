/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	| undefined
	| null
	| boolean
	| number
	| string
	| T
	| Internal_InterfaceOfJsonableTypesWith<T>
	| ArrayLike<JsonableTypeWith<T>>;

/**
 * @remarks
 * This type is a kludge and not intended for general use.
 *
 * @privateRemarks
 * Internal type testing for compatibility uses TypeOnly filter which cannot handle recursive "pure" types.
 * This interface along with ArrayLike above avoids pure type recursion issues, but introduces a limitation on
 * the ability of {@link Jsonable} to detect array-like types that are not handled naively ({@link JSON.stringify}).
 * The TypeOnly filter is not useful for {@link JsonableTypeWith}; so, if type testing improves, this can be removed.
 * @alpha
 */
export interface Internal_InterfaceOfJsonableTypesWith<T> {
	[index: string | number]: JsonableTypeWith<T>;
}

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
 * - `undefined` properties on objects are omitted (i.e., properties become undefined instead of equal to undefined).
 *
 * - When `undefined` appears as the root object or as an array element it is coerced to `null`.
 *
 * - Non-finite numbers (`NaN`, `+/-Infinity`) are also coerced to `null`.
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
	: /* test for Jsonable primitive types */ T extends
			| undefined /* is not serialized */
			| null
			| boolean
			| number
			| string
			| TReplaced
	? /* primitive types => */ T
	: // eslint-disable-next-line @typescript-eslint/ban-types
	/* test for not a function */ Extract<T, Function> extends never
	? /* not a function =>  => test for object */ T extends object
		? /* object => test for array */ T extends (infer U)[] // prefer ArrayLike test to catch non-array array-like types
			? /* array => */ Jsonable<U, TReplaced>[]
			: /* property bag => */ {
					[K in keyof T]: Extract<K, symbol> extends never
						? Jsonable<T[K], TReplaced>
						: never;
			  }
		: /* not an object => */ never
	: /* function => */ never;
