/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import type {
	SerializationErrorPerNonPublicProperties,
	SerializationErrorPerUndefinedArrayElement,
} from "./jsonSerializationErrors.js";
import type { JsonTypeWith, NonNullJsonObjectWith } from "./jsonType.js";

/**
 * Collection of utility types that are not intended to be used/imported
 * directly outside of this package.
 *
 * @beta
 * @system
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/**
	 * Returns non-symbol keys for optional properties of an object type.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as OptionalNonSymbolKeysOf<T, K>]: ...`
	 *
	 * @beta
	 * @system
	 */
	export type OptionalNonSymbolKeysOf<
		T extends object,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: T extends Record<K, T[K]> ? never : K;
		}[Keys],
		undefined | symbol
	>;

	/**
	 * Returns non-symbol keys for required properties of an object type.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as RequiredNonSymbolKeysOf<T, K>]: ...`
	 *
	 * @beta
	 * @system
	 */
	export type RequiredNonSymbolKeysOf<
		T extends object,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: T extends Record<K, T[K]> ? K : never;
		}[Keys],
		undefined | symbol
	>;

	/**
	 * Returns Result.WhenSomethingDeserializable if T is sometimes at least
	 * a partially deserializable type, otherwise Result.WhenNeverDeserializable.
	 * Fully not deserializable (functions, bigints, symbols, and undefined
	 * less intersection with TException) produce Result.WhenNeverDeserializable.
	 * An object would have a defined result even if parts of its content are
	 * not deserializable.
	 *
	 * @param Result - Result type with two properties. One property must always
	 * be `never` as `T` maybe a union of never deserializable and at least
	 * partially deserializable types and the result is a union of Result.*.
	 *
	 * @privateRemarks
	 * If `Result.WhenSomethingDeserializable` was `true` and
	 * `Result.WhenNeverDeserializable` was `false`, then the return type
	 * for type `T` would be `boolean` for a sometimes deserializable type.
	 *
	 * @beta
	 * @system
	 */
	export type TestDeserializabilityOf<
		T,
		TException,
		Result extends
			| { WhenSomethingDeserializable: unknown; WhenNeverDeserializable: never }
			| { WhenSomethingDeserializable: never; WhenNeverDeserializable: unknown },
	> = /* check for only non-serializable value types */ T extends // eslint-disable-next-line @typescript-eslint/ban-types
		| Function
		| bigint
		| symbol
		| undefined
		? /* not serializable => check for exception */ T extends TException
			? /* exception => ensure exception is not `never` */ TException extends never
				? /* `never` exception => no exception */ Result["WhenNeverDeserializable"]
				: /* proper exception => */ Result["WhenSomethingDeserializable"]
			: /* no exception => */ Result["WhenNeverDeserializable"]
		: /* at least partially serializable */ Result["WhenSomethingDeserializable"];

	/**
	 * Returns non-symbol keys for defined, (likely) serializable properties of an
	 * object type. Keys with fully unsupported properties (functions, bigints, and
	 * symbols) are excluded.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as NonSymbolWithDefinedNotDeserializablePropertyOf<T, never, K>]: ...`
	 *
	 * @beta
	 * @system
	 */
	export type NonSymbolWithDeserializablePropertyOf<
		T extends object,
		TException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: Extract<
				Exclude<T[K], TException>,
				// eslint-disable-next-line @typescript-eslint/ban-types
				undefined | symbol | Function | bigint
			> extends never
				? /* exclusively supported types or exactly `never` => check for `never` */
					T[K] extends never
					? never
					: K
				: /* value might not be supported => exclude K */ never;
		}[Keys],
		undefined | symbol
	>;

	/**
	 * Returns non-symbol keys for partially supported properties of an object type.
	 * Keys with fully unsupported properties (functions, bigints, and symbols) are
	 * excluded.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as NonSymbolWithPossiblyUndefinedNotDeserializablePropertyOf<T, never, K>]: ...`
	 *
	 * @beta
	 * @system
	 */
	export type NonSymbolWithPossiblyDeserializablePropertyOf<
		T extends object,
		TException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: Extract<
				Exclude<T[K], TException>,
				// eslint-disable-next-line @typescript-eslint/ban-types
				undefined | symbol | Function | bigint
			> extends never
				? /* exclusively supported types or exactly `never` */ never
				: /* at least some unsupported type => check for any supported */ TestDeserializabilityOf<
						T[K],
						TException,
						{ WhenSomethingDeserializable: K; WhenNeverDeserializable: never }
					>;
		}[Keys],
		undefined | symbol
	>;

	/**
	 * Filters a type `T` for `undefined` that is not viable in an array (or tuple) that
	 * must go through JSON serialization.
	 * If `T` is `undefined`, then error type {@link SerializationErrorPerUndefinedArrayElement}
	 * is returned with hopes of being informative.
	 *
	 * @beta
	 * @system
	 */
	export type JsonForSerializableArrayItem<T, TReplaced, TBlessed> =
		// Some initial filtering must be provided before a test for undefined.
		// These tests are expected to match those in JsonSerializableImpl.
		/* test for 'any' */ boolean extends (T extends never ? true : false)
			? /* 'any' => */ TBlessed
			: /* test for 'unknown' */ unknown extends T
				? /* 'unknown' => */ TBlessed
				: /* test for JSON primitive types */ T extends
							| null
							| boolean
							| number
							| string
							| TReplaced
					? /* primitive types => */ T
					: /* test for undefined possibility */ undefined extends T
						? /* undefined | ... => */ SerializationErrorPerUndefinedArrayElement
						: TBlessed;

	/**
	 * Filters a type `T` for types that become null through JSON serialization.
	 *
	 * @beta
	 * @system
	 */
	export type JsonForDeserializedArrayItem<T, TReplaced, TBlessed> =
		// Some initial filtering must be provided before a test for undefined, symbol, or function.
		// These tests are expected to match those in JsonDeserializedImpl.
		/* test for 'any' */ boolean extends (T extends never ? true : false)
			? /* 'any' => */ TBlessed
			: /* test for 'unknown' */ unknown extends T
				? /* 'unknown' => */ TBlessed
				: /* test for JSON primitive types */ T extends
							| null
							| boolean
							| number
							| string
							| TReplaced
					? /* primitive or replaced types => */ T
					: /* test for known types that become null */ T extends
								| undefined
								| symbol
								// eslint-disable-next-line @typescript-eslint/ban-types
								| Function
						? /* => */ null
						: TBlessed;

	/**
	 * Checks for a type that is simple class of number and string indexed types to numbers and strings.
	 *
	 * @beta
	 * @system
	 */
	export type IsEnumLike<T extends object> = T extends readonly (infer _)[]
		? /* array => */ false
		: T extends {
					// all numerical indices should refer to a string
					readonly [i: number]: string;
					// string indices may be string or number
					readonly [p: string]: number | string;
				}
			? /* test for a never or any property */ true extends {
					[K in keyof T]: T[K] extends never ? true : never;
				}[keyof T]
				? false
				: true
			: false;

	/**
	 * Test for type equality
	 *
	 * @returns IfSame if identical and IfDifferent otherwise.
	 *
	 * Implementation derived from https://github.com/Microsoft/TypeScript/issues/27024#issuecomment-421529650
	 *
	 * @beta
	 * @system
	 */
	export type IfSameType<X, Y, IfSame = unknown, IfDifferent = never> = (<T>() => T extends X
		? 1
		: 2) extends <T>() => T extends Y ? 1 : 2
		? IfSame
		: IfDifferent;

	/**
	 * Test for type equality
	 *
	 * @returns `true` if identical and `false` otherwise.
	 *
	 * @beta
	 * @system
	 */
	export type IsSameType<X, Y> = IfSameType<X, Y, true, false>;

	/**
	 * Checks that type is exactly `object`.
	 *
	 * @beta
	 * @system
	 */
	export type IsExactlyObject<T extends object> = IsSameType<T, object>;

	/**
	 * Creates a simple object type from an intersection of multiple.
	 * @privateRemarks `T extends Record` encourages tsc to process intersections within unions.
	 *
	 * @beta
	 * @system
	 */
	export type FlattenIntersection<T> = T extends Record<string | number | symbol, unknown>
		? {
				[K in keyof T]: T[K];
			}
		: T;

	/**
	 * Replaces any instance where a type T recurses into itself or a portion of
	 * itself with TReplacement.
	 *
	 * @beta
	 * @system
	 */
	export type ReplaceRecursionWith<T, TReplacement> = ReplaceRecursionWithImpl<
		T,
		TReplacement,
		never
	>;

	/**
	 * Implementation for {@link InternalUtilityTypes.ReplaceRecursionWith}
	 *
	 * @beta
	 * @system
	 */
	export type ReplaceRecursionWithImpl<T, TReplacement, TAncestorTypes> =
		/* test for recursion */ T extends TAncestorTypes
			? /* recursion => use replacement */ TReplacement
			: T extends object
				? // eslint-disable-next-line @typescript-eslint/ban-types
					/* test for function */ T extends Function
					? /* function => */ T
					: /* property bag => */ {
							[K in keyof T]: ReplaceRecursionWithImpl<T[K], TReplacement, TAncestorTypes | T>;
						}
				: /* non-object => T as is */ T;

	/**
	 * Test for non-public properties (class instance type)
	 * Compare original (unprocessed) to filtered case that has `any` where
	 * recursing.
	 *
	 * @beta
	 * @system
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type HasNonPublicProperties<T> = ReplaceRecursionWith<T, any> extends T
		? false
		: true;

	/**
	 * Outer implementation of {@link JsonSerializable} handling meta cases
	 * like classes (with non-public properties).
	 *
	 * @beta
	 * @system
	 */
	export type JsonSerializableImpl<
		T,
		Options extends {
			Replaced: unknown;
			IgnoreInaccessibleMembers?: "ignore-inaccessible-members";
		},
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ JsonTypeWith<Options["Replaced"]>
		: Options["IgnoreInaccessibleMembers"] extends "ignore-inaccessible-members"
			? JsonSerializableFilter<T, Options["Replaced"]>
			: /* test for non-public properties (class instance type) */
				HasNonPublicProperties<T> extends true
				? /* hidden props => test if it is array properties that are the problem */ T extends readonly (infer _)[]
					? /* array => */ {
							/* use homomorphic mapped type to preserve tuple type */
							[K in keyof T]: JsonSerializableImpl<
								T[K],
								{ Replaced: Options["Replaced"] | T }
							>;
						}
					: /* not array => error */ SerializationErrorPerNonPublicProperties
				: /* no hidden properties => apply filtering => */ JsonSerializableFilter<
						T,
						Options["Replaced"]
					>;

	/**
	 * Core implementation of {@link JsonSerializable}.
	 *
	 * @beta
	 * @system
	 */
	export type JsonSerializableFilter<T, TReplaced> = /* test for 'any' */ boolean extends (
		T extends never
			? true
			: false
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
									[K in keyof T]: JsonForSerializableArrayItem<
										T[K],
										TReplaced,
										JsonSerializableFilter<T[K], TReplaced | T>
									>;
								}
							: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
								? /* `object` => */ NonNullJsonObjectWith<TReplaced>
								: /* test for enum like types */ IsEnumLike<T> extends true
									? /* enum or similar simple type (return as-is) => */ T
									: /* property bag => */ FlattenIntersection<
											{
												/* required properties are recursed and may not have undefined values. */
												[K in keyof T as RequiredNonSymbolKeysOf<
													T,
													K
												>]-?: undefined extends T[K]
													? {
															["error required property may not allow undefined value"]: never;
														}
													: JsonSerializableFilter<T[K], TReplaced | T>;
											} & {
												/* optional properties are recursed and allowed to preserve undefined value type. */
												[K in keyof T as OptionalNonSymbolKeysOf<
													T,
													K
												>]?: JsonSerializableFilter<T[K], TReplaced | T | undefined>;
											} & {
												/* symbol properties are rejected */
												[K in keyof T & symbol]: never;
											}
										>
						: /* not an object => */ never
					: /* function => */ never;

	/**
	 * Sentinel type for use when marking points of recursion (in a recursive type).
	 * Type is expected to be unique, though no lengths is taken to ensure that.
	 *
	 * @beta
	 * @system
	 */
	export interface RecursionMarker {
		"recursion here": "recursion here";
	}

	/**
	 * Outer implementation of {@link JsonDeserialized} handling meta cases
	 * like recursive types.
	 *
	 * @beta
	 * @system
	 */
	export type JsonDeserializedImpl<T, TReplaced> = /* test for 'any' */ boolean extends (
		T extends never
			? true
			: false
	)
		? /* 'any' => */ JsonTypeWith<TReplaced>
		: /* infer non-recursive version of T */ ReplaceRecursionWith<
					T,
					RecursionMarker
				> extends infer TNoRecursion
			? /* test for no change from filtered type */ IsSameType<
					TNoRecursion,
					JsonDeserializedFilter<TNoRecursion, TReplaced, 0>
				> extends true
				? /* same (no filtering needed) => test for non-public properties (class instance type) */
					HasNonPublicProperties<T> extends true
					? /* hidden props => apply filtering to avoid retaining exact class => */ JsonDeserializedFilter<
							T,
							TReplaced
						>
					: /* no hidden properties => deserialized T is just T */ T
				: /* filtering is needed => */ JsonDeserializedFilter<T, TReplaced>
			: /* unreachable else for infer */ never;

	/**
	 * Recurses T applying {@link InternalUtilityTypes.JsonDeserializedFilter} up to RecurseLimit times.
	 *
	 * @beta
	 * @system
	 */
	export type JsonDeserializedRecursion<T, TReplaced, RecurseLimit, TAncestorTypes> =
		T extends TAncestorTypes
			? RecurseLimit extends 10
				? JsonDeserializedFilter<T, TReplaced, 9, TAncestorTypes | T>
				: RecurseLimit extends 9
					? JsonDeserializedFilter<T, TReplaced, 8, TAncestorTypes | T>
					: RecurseLimit extends 8
						? JsonDeserializedFilter<T, TReplaced, 7, TAncestorTypes | T>
						: RecurseLimit extends 7
							? JsonDeserializedFilter<T, TReplaced, 6, TAncestorTypes | T>
							: RecurseLimit extends 6
								? JsonDeserializedFilter<T, TReplaced, 5, TAncestorTypes | T>
								: RecurseLimit extends 5
									? JsonDeserializedFilter<T, TReplaced, 4, TAncestorTypes | T>
									: RecurseLimit extends 4
										? JsonDeserializedFilter<T, TReplaced, 3, TAncestorTypes | T>
										: RecurseLimit extends 3
											? JsonDeserializedFilter<T, TReplaced, 2, TAncestorTypes | T>
											: RecurseLimit extends 2
												? JsonDeserializedFilter<T, TReplaced, 1, TAncestorTypes | T>
												: JsonTypeWith<TReplaced>
			: JsonDeserializedFilter<T, TReplaced, RecurseLimit, TAncestorTypes | T>;

	/**
	 * Core implementation of {@link JsonDeserialized}.
	 *
	 * @beta
	 * @system
	 */
	export type JsonDeserializedFilter<
		T,
		TReplaced,
		RecurseLimit = 10,
		TAncestorTypes = never,
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
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
									[K in keyof T]: JsonForDeserializedArrayItem<
										T[K],
										TReplaced,
										JsonDeserializedRecursion<T[K], TReplaced, RecurseLimit, TAncestorTypes>
									>;
								}
							: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
								? /* `object` => */ NonNullJsonObjectWith<TReplaced>
								: /* test for enum like types */ IsEnumLike<T> extends true
									? /* enum or similar simple type (return as-is) => */ T
									: /* property bag => */ FlattenIntersection<
											/* properties with symbol keys or wholly unsupported values are removed */
											{
												/* properties with defined values are recursed */
												[K in keyof T as NonSymbolWithDeserializablePropertyOf<
													T,
													TReplaced,
													K
												>]: JsonDeserializedRecursion<
													T[K],
													TReplaced,
													RecurseLimit,
													TAncestorTypes
												>;
											} & {
												/* properties that may have undefined values are optional */
												[K in keyof T as NonSymbolWithPossiblyDeserializablePropertyOf<
													T,
													TReplaced,
													K
												>]?: JsonDeserializedRecursion<
													T[K],
													TReplaced,
													RecurseLimit,
													TAncestorTypes
												>;
											}
										>
						: /* not an object => */ never
					: /* function => */ never;
}
