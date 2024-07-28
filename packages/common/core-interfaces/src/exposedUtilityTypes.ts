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
	 * Metatype for controlling filtering utilities.
	 *
	 * @system
	 */
	export interface FilterControls {
		/**
		 * Exact types that are managed by custom deserialization logic (beyond
		 * JSON.parse). Only exact types matching specification will be preserved
		 * unaltered.
		 */
		AllowExactly: unknown;

		/**
		 * General types that are managed by custom deserialization logic (beyond
		 * JSON.parse). Any type satisfying specification will be preserved unaltered.
		 */
		AllowExtensionOf: unknown;
	}

	/**
	 * Returns non-symbol keys for optional properties of an object type.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as OptionalNonSymbolKeysOf<T, K>]: ...`
	 *
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
	 * @system
	 */
	export type TestDeserializabilityOf<
		T,
		TExactException,
		TExtendsException,
		Result extends
			| { WhenSomethingDeserializable: unknown; WhenNeverDeserializable: never }
			| { WhenSomethingDeserializable: never; WhenNeverDeserializable: unknown },
	> = /* check for only non-serializable value types */ T extends // eslint-disable-next-line @typescript-eslint/ban-types
		| Function
		| bigint
		| symbol
		| undefined
		? /* not serializable => check for extends exception */ T extends TExtendsException
			? /* extends exception => ensure extends exception is not `never` */ TExtendsException extends never
				? /* `never` extends exception => no exception */ Result["WhenNeverDeserializable"]
				: /* proper exception => */ Result["WhenSomethingDeserializable"]
			: /* no extends exception => check for exact exception */ IfExactTypeInUnion<
					T,
					TExactException,
					/* exact exception => ensure exact exception is not `never` */ TExactException extends never
						? /* `never` exact exception => no exception */ Result["WhenNeverDeserializable"]
						: /* proper exception => */ Result["WhenSomethingDeserializable"],
					/* no exception => */ Result["WhenNeverDeserializable"]
				>
		: /* at least partially serializable */ Result["WhenSomethingDeserializable"];

	/**
	 * Similar to `Exclude` but only excludes exact `U`s from `T`
	 * rather than any type that extends `U`.
	 *
	 * @system
	 */
	export type ExcludeExactly<T, U> = IfSameType<T, U, never, T>;

	/**
	 * Returns non-symbol keys for defined, (likely) serializable properties of an
	 * object type. Keys with fully unsupported properties (functions, bigints, and
	 * symbols) are excluded.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as NonSymbolWithDeserializablePropertyOf<T, never, never, K>]: ...`
	 *
	 * @system
	 */
	export type NonSymbolWithDeserializablePropertyOf<
		T extends object,
		TExactException,
		TExtendsException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: Extract<
				ExcludeExactly<Exclude<T[K], TExtendsException>, TExactException>,
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
	 * `[K in keyof T as NonSymbolWithPossiblyDeserializablePropertyOf<T, never, never, K>]: ...`
	 *
	 * @system
	 */
	export type NonSymbolWithPossiblyDeserializablePropertyOf<
		T extends object,
		TExactException,
		TExtendsException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: Extract<
				ExcludeExactly<Exclude<T[K], TExtendsException>, TExactException>,
				// eslint-disable-next-line @typescript-eslint/ban-types
				undefined | symbol | Function | bigint
			> extends never
				? /* exclusively supported types or exactly `never` */ never
				: /* at least some unsupported type => check for any supported */ TestDeserializabilityOf<
						T[K],
						TExactException,
						TExtendsException,
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
	 * @system
	 */
	export type JsonForSerializableArrayItem<
		T,
		Controls extends FilterControls,
		TBlessed,
	> = /* Some initial filtering must be provided before a test for undefined. */
	/* These tests are expected to match those in JsonSerializableImpl. */
	/* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ TBlessed
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ TBlessed
			: /* test for JSON primitive types or given alternative */ T extends
						| null
						| boolean
						| number
						| string
						| Controls["AllowExtensionOf"]
				? /* primitive types or alternative => */ T
				: /* test for exact alternative */ IfExactTypeInUnion<
						T,
						Controls["AllowExactly"],
						T,
						/* test for undefined possibility */ undefined extends T
							? /* undefined | ... => */ SerializationErrorPerUndefinedArrayElement
							: TBlessed
					>;

	/**
	 * Filters a type `T` for types that become null through JSON serialization.
	 *
	 * @system
	 */
	export type JsonForDeserializedArrayItem<
		T,
		Controls extends FilterControls,
		TBlessed,
	> = /* Some initial filtering must be provided before a test for undefined, symbol, or function. */
	/* These tests are expected to match those in JsonDeserializedImpl. */
	/* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ TBlessed
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ TBlessed
			: /* test for JSON primitive types or general alternative */ T extends
						| null
						| boolean
						| number
						| string
						| Controls["AllowExtensionOf"]
				? /* primitive or replaced types => */ T
				: /* test for exact alternative */ IfExactTypeInUnion<
						T,
						Controls["AllowExactly"],
						/* exactly replaced => */ T,
						/* test for known types that become null */ T extends
							| undefined
							| symbol
							// eslint-disable-next-line @typescript-eslint/ban-types
							| Function
							? /* => */ null
							: TBlessed
					>;

	/**
	 * Checks for a type that is simple class of number and string indexed types to numbers and strings.
	 *
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
	 * @system
	 */
	export type IfSameType<X, Y, IfSame = unknown, IfDifferent = never> = (<T>() => T extends X
		? 1
		: 2) extends <T>() => T extends Y ? 1 : 2
		? IfSame
		: IfDifferent;

	/**
	 * Test for type equality with union of other types.
	 *
	 * @typeParam T - Type to find in Union. If this is itself a union, then all types must befound in Union.
	 * @typeParam Union - Union of types to test against.
	 *
	 * @system
	 */
	export type IfExactTypeInUnion<T, Union, IfMatch = unknown, IfNoMatch = never> = IfSameType<
		T,
		Extract<Union, T>,
		IfMatch,
		IfNoMatch
	>;

	/**
	 * Test for type equality
	 *
	 * @returns `true` if identical and `false` otherwise.
	 *
	 * @system
	 */
	export type IsSameType<X, Y> = IfSameType<X, Y, true, false>;

	/**
	 * Checks that type is exactly `object`.
	 *
	 * @system
	 */
	export type IsExactlyObject<T extends object> = IsSameType<T, object>;

	/**
	 * Creates a simple object type from an intersection of multiple.
	 * @privateRemarks `T extends Record` encourages tsc to process intersections within unions.
	 *
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
	 * @system
	 */
	export type JsonSerializableImpl<
		T,
		Options extends Partial<FilterControls> & {
			IgnoreInaccessibleMembers?: "ignore-inaccessible-members";
		},
	> = /* Build Controls from Options filling in defaults for any missing properties */
	{
		AllowExactly: Options extends { AllowExactly: unknown } ? Options["AllowExactly"] : never;
		AllowExtensionOf: Options extends { AllowExtensionOf: unknown }
			? Options["AllowExtensionOf"]
			: never;
	} extends infer Controls
		? /* Controls should always satisfy FilterControls, but Typescript wants a check */
			Controls extends FilterControls
			? /* test for 'any' */ boolean extends (T extends never ? true : false)
				? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
				: Options["IgnoreInaccessibleMembers"] extends "ignore-inaccessible-members"
					? JsonSerializableFilter<T, Controls>
					: /* test for non-public properties (class instance type) */
						/* TODO - make an allowance for classes with non-public properties in Allow* types */
						HasNonPublicProperties<T> extends true
						? /* hidden props => test if it is array properties that are the problem */ T extends readonly (infer _)[]
							? /* array => */ {
									/* use homomorphic mapped type to preserve tuple type */
									[K in keyof T]: JsonSerializableImpl<
										T[K],
										{
											AllowExactly: Controls["AllowExactly"] | T;
											AllowExtensionOf: Controls["AllowExtensionOf"];
										}
									>;
								}
							: /* not array => error */ SerializationErrorPerNonPublicProperties
						: /* no hidden properties => apply filtering => */ JsonSerializableFilter<
								T,
								Controls
							>
			: never /* FilterControls assert else; should never be reached */
		: never /* unreachable else for infer */;

	/**
	 * Core implementation of {@link JsonSerializable}.
	 *
	 * @privateRemarks
	 * Note that `T` becomes an Controls.AllowExtensionOf type during recursion.
	 * Filtering through a single layer of recursion is all that is required
	 * when using in prescribed filter scenario. Controls.AllowExtensionOf must
	 * be used instead of Controls.AllowExactly to avoid possibly deep and
	 * infinite recursion from tsc. Checking extension of is sufficient as all
	 * extended types from the recursion type are more specific and and would
	 * be considered before reaching the more general T currently being processed.
	 *
	 * @system
	 */
	export type JsonSerializableFilter<
		T,
		Controls extends FilterControls,
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ JsonTypeWith<
					Controls["AllowExactly"] | Controls["AllowExtensionOf"]
				>
			: /* test for JSON Encodable primitive types or given alternate base */ T extends
						| null
						| boolean
						| number
						| string
						| Controls["AllowExtensionOf"]
				? /* primitive typesor alternate => */ T
				: /* test for exact alternate */ IfExactTypeInUnion<
							T,
							Controls["AllowExactly"],
							true,
							"no match"
						> extends true
					? /* exact alternate type => */ T
					: // eslint-disable-next-line @typescript-eslint/ban-types
						/* test for not a function */ Extract<T, Function> extends never
						? /* not a function => test for object */ T extends object
							? /* object => test for array */ T extends readonly (infer _)[]
								? /* array => */ {
										/* array items may not not allow undefined */
										/* use homomorphic mapped type to preserve tuple type */
										[K in keyof T]: JsonForSerializableArrayItem<
											T[K],
											Controls,
											JsonSerializableFilter<
												T[K],
												{
													AllowExactly: Controls["AllowExactly"];
													AllowExtensionOf: Controls["AllowExtensionOf"] | T;
												}
											>
										>;
									}
								: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
									? /* `object` => */ NonNullJsonObjectWith<
											Controls["AllowExactly"] | Controls["AllowExtensionOf"]
										>
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
														: JsonSerializableFilter<
																T[K],
																{
																	AllowExactly: Controls["AllowExactly"];
																	AllowExtensionOf: Controls["AllowExtensionOf"] | T;
																}
															>;
												} & {
													/* optional properties are recursed and allowed to preserve undefined value type. */
													[K in keyof T as OptionalNonSymbolKeysOf<
														T,
														K
													>]?: JsonSerializableFilter<
														T[K],
														{
															AllowExactly: Controls["AllowExactly"];
															AllowExtensionOf: Controls["AllowExtensionOf"] | T | undefined;
														}
													>;
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
	 * @system
	 */
	export interface RecursionMarker {
		"recursion here": "recursion here";
	}

	/**
	 * Outer implementation of {@link JsonDeserialized} handling meta cases
	 * like recursive types.
	 *
	 * @system
	 */
	export type JsonDeserializedImpl<
		T,
		Options extends Partial<FilterControls>,
	> = /* Build Controls from Options filling in defaults for any missing properties */
	{
		AllowExactly: Options extends { AllowExactly: unknown } ? Options["AllowExactly"] : never;
		AllowExtensionOf: Options extends { AllowExtensionOf: unknown }
			? Options["AllowExtensionOf"]
			: never;
	} extends infer Controls
		? /* Controls should always satisfy FilterControls, but Typescript wants a check */
			Controls extends FilterControls
			? /* test for 'any' */ boolean extends (T extends never ? true : false)
				? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
				: /* infer non-recursive version of T */ ReplaceRecursionWith<
							T,
							RecursionMarker
						> extends infer TNoRecursion
					? /* test for no change from filtered type */ IsSameType<
							TNoRecursion,
							JsonDeserializedFilter<TNoRecursion, Controls, 0>
						> extends true
						? /* same (no filtering needed) => test for non-public
						     properties (class instance type) */
							/* TODO - make an allowance for classes with non-public properties in Allow* types */
							HasNonPublicProperties<T> extends true
							? /* hidden props => apply filtering to avoid retaining
							     exact class except for any classes in allowances => */
								JsonDeserializedFilter<T, Controls>
							: /* no hidden properties => deserialized T is just T */
								T
						: /* filtering is needed => */ JsonDeserializedFilter<T, Controls>
					: /* unreachable else for infer */ never
			: never /* FilterControls assert else; should never be reached */
		: never /* unreachable else for infer */;

	/**
	 * Recursion limit is the count of `+` that prefix it when string.
	 *
	 * @system
	 */
	export type RecursionLimit = `+${string}` | 0;

	/**
	 * Recurses T applying {@link InternalUtilityTypes.JsonDeserializedFilter} up to RecurseLimit times.
	 *
	 * @system
	 */
	export type JsonDeserializedRecursion<
		T,
		Controls extends FilterControls,
		RecurseLimit extends RecursionLimit,
		TAncestorTypes,
	> = T extends TAncestorTypes
		? RecurseLimit extends `+${infer RecursionRemainder}`
			? JsonDeserializedFilter<
					T,
					Controls,
					RecursionRemainder extends RecursionLimit ? RecursionRemainder : 0,
					TAncestorTypes | T
				>
			: JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
		: JsonDeserializedFilter<T, Controls, RecurseLimit, TAncestorTypes | T>;

	/**
	 * Core implementation of {@link JsonDeserialized}.
	 *
	 * @system
	 */
	export type JsonDeserializedFilter<
		T,
		Controls extends FilterControls,
		RecurseLimit extends RecursionLimit = "++++" /* 4 */,
		TAncestorTypes = T /* Always start with self as ancestor; otherwise recursion limit appears one greater */,
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ JsonTypeWith<
					Controls["AllowExactly"] | Controls["AllowExtensionOf"]
				>
			: /* test for deserializable primitive types or given alternate base */ T extends
						| null
						| boolean
						| number
						| string
						| Controls["AllowExtensionOf"]
				? /* primitive types or alternate => */ T
				: /* test for given exact alternate */ IfExactTypeInUnion<
							T,
							Controls["AllowExactly"],
							true,
							"not found"
						> extends true
					? /* exact alternate type => */ T
					: // eslint-disable-next-line @typescript-eslint/ban-types
						/* test for not a function */ Extract<T, Function> extends never
						? /* not a function => test for object */ T extends object
							? /* object => test for array */ T extends readonly (infer _)[]
								? /* array => */ {
										/* array items may not not allow undefined */
										/* use homomorphic mapped type to preserve tuple type */
										[K in keyof T]: JsonForDeserializedArrayItem<
											T[K],
											Controls,
											JsonDeserializedRecursion<T[K], Controls, RecurseLimit, TAncestorTypes>
										>;
									}
								: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
									? /* `object` => */ NonNullJsonObjectWith<
											Controls["AllowExactly"] | Controls["AllowExtensionOf"]
										>
									: /* test for enum like types */ IsEnumLike<T> extends true
										? /* enum or similar simple type (return as-is) => */ T
										: /* property bag => */ FlattenIntersection<
												/* properties with symbol keys or wholly unsupported values are removed */
												{
													/* properties with defined values are recursed */
													[K in keyof T as NonSymbolWithDeserializablePropertyOf<
														T,
														Controls["AllowExactly"],
														Controls["AllowExtensionOf"],
														K
													>]: JsonDeserializedRecursion<
														T[K],
														Controls,
														RecurseLimit,
														TAncestorTypes
													>;
												} & {
													/* properties that may have undefined values are optional */
													[K in keyof T as NonSymbolWithPossiblyDeserializablePropertyOf<
														T,
														Controls["AllowExactly"],
														Controls["AllowExtensionOf"],
														K
													>]?: JsonDeserializedRecursion<
														T[K],
														Controls,
														RecurseLimit,
														TAncestorTypes
													>;
												}
											>
							: /* not an object => */ never
						: /* function => */ never;
}
