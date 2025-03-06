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
 * Unique symbol for recursion meta-typing.
 */
const RecursionMarkerSymbol: unique symbol = Symbol("recursion here");

/**
 * Collection of utility types that are not intended to be used/imported
 * directly outside of this package.
 *
 * @privateRemarks
 * There are ony three intentional exports from this module:
 * - {@link InternalUtilityTypes.IfSameType | IfSameType}
 * - {@link InternalUtilityTypes.JsonDeserializedImpl | JsonDeserializedImpl }
 * - {@link InternalUtilityTypes.JsonSerializableImpl | JsonSerializableImpl }
 *
 * api-extractor will allow `export` to be removed from others but generates
 * api-report a little oddly with a rogue `{};` floating at end of namespace
 * in api.md file. It will promote all of the support types to appear as
 * exported anyway. All in namespace are left exported to avoid api-extractor
 * potentially failing to validate other modules correctly.
 *
 * @beta
 * @system
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/**
	 * Meta-type for controlling filtering utilities.
	 *
	 * @system
	 */
	export interface FilterControls {
		/**
		 * Exact types that are managed by custom serialization/deserialization
		 * logic (beyond JSON.stringify and JSON.parse without replacers/revivers).
		 * Only exact types matching specification will be preserved unaltered.
		 *
		 * @privateRemarks
		 * This could be a tuple of types that would support replacing exactly
		 * specified unions. However that would not be useful in the context of
		 * serializers/deserializers as those must work only with the specific
		 * data given at runtime and have no knowledge of the alternate data
		 * that could be encountered in that space.
		 *
		 * Such union matching is only known to be useful for matching recursion
		 * cases.
		 */
		AllowExactly: unknown;

		/**
		 * General types that are managed by custom serialization/deserialization
		 * logic (beyond JSON.stringify and JSON.parse without replacers/revivers).
		 * Any type satisfying specification will be preserved unaltered.
		 */
		AllowExtensionOf: unknown;
	}

	/**
	 * @system
	 */
	interface DeserializedFilterControls extends FilterControls {
		/**
		 * Same as `AllowExactly` but separated to allow for `AllowExactly` to
		 * `unknown` while having internal secondary list.
		 */
		InternalAllowExactly: unknown;
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
	 * Returns Result.WhenSomethingDeserializable if T is sometimes at least a
	 * partially deserializable type, otherwise Result.WhenNeverDeserializable.
	 * Fully not deserializable (bigints, symbols, undefined and functions without
	 * other properties less overlap with T*Exception) produce Result.WhenNeverDeserializable.
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
	> = /* ensure working with more than never */ T extends never
		? /* never => */ Result["WhenNeverDeserializable"]
		: /* check for extends exception */ T extends TExtendsException
			? /* extends exception => */ Result["WhenSomethingDeserializable"]
			: /* no extends exception => check for exact exception */ IfExactTypeInUnion<
					T,
					TExactException,
					/* exact exception => */ Result["WhenSomethingDeserializable"],
					/* no exception => check for only non-serializable value types */ T extends
						| bigint
						| symbol
						| undefined
						? /* not serializable => */ Result["WhenNeverDeserializable"]
						: // eslint-disable-next-line @typescript-eslint/ban-types
							T extends Function
							? ExtractFunctionFromIntersection<T> extends {
									classification: "exactly Function";
								}
								? /* not serializable => */ Result["WhenNeverDeserializable"]
								: /* at least partially serializable */ Result["WhenSomethingDeserializable"]
							: /* at least partially serializable */ Result["WhenSomethingDeserializable"]
				>;

	/**
	 * Similar to `Exclude` but only excludes exact `U`s from `T`
	 * rather than any type that extends `U`.
	 *
	 * @system
	 */
	export type ExcludeExactly<T, U> = IfSameType<T, U, never, T>;

	/**
	 * Returns non-symbol keys for defined, (likely) serializable properties of an
	 * object type. Keys with fully unsupported properties (undefined, symbol, and
	 * bigint) and sometimes unsupported (functions) are excluded. An exception to
	 * that is when there are supported types in union with just bigint.
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
			[K in Keys]: /* all possible types that aren't already allowed, with the exception of `unknown` */
			ExcludeExactly<
				Exclude<T[K], TExtendsException>,
				ExcludeExactly<TExactException, unknown>
			> extends infer PossibleTypeLessAllowed
				? IfSameType<
						PossibleTypeLessAllowed,
						unknown,
						/* value might not be supported => exclude K */ never,
						/* extract types that might lead to missing property */ Extract<
							PossibleTypeLessAllowed,
							/* types that might lead to missing property, except `bigint` */
							// eslint-disable-next-line @typescript-eslint/ban-types
							undefined | symbol | Function
						> extends never
							? /* all types are supported plus possibly `bigint` => */
								/* check for only `bigint` remaining */ IfSameType<
									PossibleTypeLessAllowed,
									bigint,
									/* only `bigint` => nothing supported */ never,
									/* exclusively supported types (and maybe `bigint`) or exactly `never` */
									/* => check for `never` */ T[K] extends never ? never : K
								>
							: /* value might not be supported => exclude K */ never
					>
				: never;
		}[Keys],
		undefined | symbol
	>;

	/**
	 * Returns non-symbol keys for partially supported properties of an object type.
	 * Keys with only unsupported properties (undefined, symbol, bigint, and
	 * functions without other properties) are excluded.
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
			[K in Keys]: /* all possible types that aren't already allowed, with the exception of `unknown` */
			ExcludeExactly<
				Exclude<T[K], TExtendsException>,
				ExcludeExactly<TExactException, unknown>
			> extends infer PossibleTypeLessAllowed
				? Extract<
						IfSameType<PossibleTypeLessAllowed, unknown, undefined, PossibleTypeLessAllowed>,
						/* types that might lead to missing property */
						// eslint-disable-next-line @typescript-eslint/ban-types
						undefined | symbol | Function
					> extends never
					? /* exclusively supported types or exactly `never` */ never
					: /* at least some unsupported type => check for any supported */ TestDeserializabilityOf<
							T[K],
							ExcludeExactly<TExactException, unknown>,
							TExtendsException,
							{ WhenSomethingDeserializable: K; WhenNeverDeserializable: never }
						>
				: never;
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
		TAncestorTypes extends unknown[],
		TBlessed,
	> = /* Some initial filtering must be provided before a test for undefined. */
	/* These tests are expected to match those in JsonSerializableImpl. */
	/* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ TBlessed
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ TBlessed
			: /* test for exact recursion */ IfExactTypeInTuple<
					T,
					TAncestorTypes,
					/* recursion; stop here => */ T,
					/* test for JSON primitive types or given alternative */ T extends
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
							>
				>;

	/**
	 * Filters a type `T` for types that become null through JSON serialization.
	 *
	 * @system
	 */
	export type JsonForDeserializedArrayItem<
		T,
		Controls extends DeserializedFilterControls,
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
						/* test for internal exact alternative */ IfExactTypeInUnion<
							T,
							Controls["InternalAllowExactly"],
							/* exactly replaced => */ T,
							/* test for known types that become null */ T extends undefined | symbol
								? /* => */ null
								: // eslint-disable-next-line @typescript-eslint/ban-types
									T extends Function
									? ExtractFunctionFromIntersection<T> extends {
											classification: "exactly Function";
										}
										? null
										: null | TBlessed
									: TBlessed
						>
					>;

	/**
	 * Checks for a type that is simple class of number and string indexed types to numbers and strings.
	 *
	 * @system
	 */
	export type IfEnumLike<
		T extends object,
		EnumLike = never,
		NotEnumLike = unknown,
	> = T extends readonly (infer _)[]
		? /* array => */ NotEnumLike
		: // eslint-disable-next-line @typescript-eslint/ban-types
			T extends Function
			? /* function => */ NotEnumLike
			: T extends {
						// all numerical indices should refer to a string
						readonly [i: number]: string;
						// string indices may be string or number
						readonly [p: string]: number | string;
						// no symbol indices are allowed
						readonly [s: symbol]: never;
					}
				? /* test for a never or any property */ true extends {
						[K in keyof T]: T[K] extends never ? true : never;
					}[keyof T]
					? NotEnumLike
					: EnumLike
				: NotEnumLike;

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
	 * Test for type equality with tuple of other types.
	 *
	 * @typeParam T - Type to find in Tuple.
	 * @typeParam Tuple - Tuple of types to test against.
	 * @typeParam IfMatch - Type to return if match is found.
	 * @typeParam IfNoMatch - Type to return if no match is found.
	 *
	 * @privateRemarks
	 * Tests for an extact match of `T` in `Tuple[0]`. If not found,
	 * recurses with the remainder of the tuple.
	 */
	export type IfExactTypeInTuple<
		T,
		Tuple extends unknown[],
		IfMatch = unknown,
		IfNoMatch = never,
	> = Tuple extends [infer First, ...infer Rest]
		? IfSameType<T, First, IfMatch, IfExactTypeInTuple<T, Rest, IfMatch, IfNoMatch>>
		: IfNoMatch;

	/**
	 * Test for type equality with union of other types.
	 *
	 * @typeParam T - Type to find in Union. If this is itself a union, then all types must be found in Union.
	 * @typeParam Union - Union of types to test against.
	 * @typeParam IfMatch - Type to return if match is found.
	 * @typeParam IfNoMatch - Type to return if no match is found.
	 *
	 * @remarks
	 * In a recursive context, use {@link InternalUtilityTypes.IfExactTypeInTuple} to manage ancestry.
	 *
	 * @privateRemarks
	 * Perhaps it is a Typescript defect but a simple check that `T` is `never`
	 * via `T extends never` does not work as expected in this context.
	 * Workaround using `IfSameType<..., never,...>`.
	 * @system
	 */
	export type IfExactTypeInUnion<T, Union, IfMatch = unknown, IfNoMatch = never> = IfSameType<
		T,
		never,
		/* T is never => */ IfSameType<Union, never, IfMatch, IfNoMatch>,
		/* T is NOT never => */ IfSameType<T, Extract<Union, T>, IfMatch, IfNoMatch>
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
	 * @privateRemarks
	 * `T extends Record` within the implementation encourages tsc to process
	 * intersections within unions.
	 *
	 * @system
	 */
	export type FlattenIntersection<T extends Record<string | number | symbol, unknown>> =
		T extends Record<string | number | symbol, unknown>
			? {
					[K in keyof T]: T[K];
				}
			: T;

	/**
	 * Extracts Function portion from an intersection (&) type returning
	 * the extracted portion in the `function` property or `unknown` if
	 * no function is found.
	 * The returned `classification` property has one of three values:
	 * - "no Function" if the type is not a function.
	 * - "exactly Function" if the type is exactly a function.
	 * - "Function and more" if the type is a function and has other properties.
	 *
	 * @system
	 */
	export type ExtractFunctionFromIntersection<T extends object> = (T extends new (
		...args: infer A
	) => infer R
		? new (
				...args: A
			) => R
		: unknown) &
		(T extends (...args: infer A) => infer R
			? (...args: A) => R
			: unknown) extends infer Functional
		? {
				classification: unknown extends Functional
					? "no Function"
					: Functional extends Required<T>
						? "exactly Function"
						: "Function and more";
				function: Functional;
			}
		: never;

	/**
	 * Returns `Filtered` & any Function intersection from `Original`.
	 * If `Original` is exactly a Function, then `Filtered` is left out
	 * under the assumption that it is not useful/applicable.
	 *
	 * @system
	 */
	export type FilterPreservingFunction<
		Original extends object,
		Filtered,
	> = ExtractFunctionFromIntersection<Original> extends {
		classification: infer TClassification;
		function: infer TFunction;
	}
		? TClassification extends "exactly Function"
			? TFunction
			: TFunction & Filtered
		: never;

	/**
	 * Replaces any instance where a type T recurses into itself or a portion of
	 * itself with TRecursionMarker.
	 *
	 * @typeParam T - Type to process.
	 * @typeParam TRecursionMarker - Replacement marker type.
	 * @typeParam Controls - Allowances are preserved as-is.
	 * @typeParam TAncestorTypes - Types that are ancestors of T.
	 * @typeParam TNextAncestor - Set exactly to T. This is passed separately
	 * such that T union types remain intact as exact ancestors.
	 *
	 * @remarks
	 * Filtering applied to class instances with non-public properties will not
	 * preserve the class instance unless those classes are known and listed as
	 * allowances via `Controls`.
	 *
	 * @privateRemarks
	 * This implementation handles functions including function with properties.
	 * There are no known cases where replacing recursion under such types make
	 * a difference. Either the function (whole type) is allowed by the Json
	 * filters or function is not allowed at all.
	 * If the function portion is found to be problematic later, then could use
	 * `T extends Function ? T : ...` to ignore function objects.
	 *
	 * @system
	 */
	export type ReplaceRecursionWithMarkerAndPreserveAllowances<
		T,
		TRecursionMarker,
		Controls extends FilterControls,
		TAncestorTypes extends unknown[] = [],
		TNextAncestor = T,
	> = /* test for recursion */
	IfExactTypeInTuple<T, TAncestorTypes, true, "no match"> extends true
		? /* recursion => use replacement */ TRecursionMarker
		: /* force union separation hereafter */ T extends infer _
			? /* test for recursion among union elements */
				IfExactTypeInTuple<T, TAncestorTypes, true, "no match"> extends true
				? TRecursionMarker
				: /* test for general allowance */ T extends Controls["AllowExtensionOf"]
					? /* allowed extension type => */ T
					: /* test for exact allowance */ IfExactTypeInUnion<
								T,
								Controls["AllowExactly"],
								true,
								"no match"
							> extends true
						? /* exact allowed type => */ T
						: T extends object
							? FilterPreservingFunction<
									T,
									{
										[K in keyof T]: ReplaceRecursionWithMarkerAndPreserveAllowances<
											T[K],
											TRecursionMarker,
											Controls,
											[TNextAncestor, ...TAncestorTypes]
										>;
									}
								>
							: /* non-object => T as is */ T
			: never;

	/**
	 * Replaces any instances of "allowed" types and recursion within with `never`.
	 *
	 * @typeParam T - Type to process.
	 * @typeParam Controls - Allowances to replace.
	 * @typeParam TAncestorTypes - Types that are ancestors of T.
	 * @typeParam TNextAncestor - Set exactly to T. This is passed separately
	 * such that T union types remain intact as exact ancestors.
	 *
	 * @system
	 */
	export type ReplaceAllowancesAndRecursionWithNever<
		T,
		Controls extends FilterControls,
		TAncestorTypes extends unknown[] = [],
		TNextAncestor = T,
	> = /* test for exact recursion first */ IfExactTypeInTuple<
		T,
		TAncestorTypes,
		true,
		"no match"
	> extends true
		? /* recursion => */ never
		: /* test for general allowance (also forces union separation) */ T extends Controls["AllowExtensionOf"]
			? /* allowed extension type => */ never
			: /* test for exact allowance */ IfExactTypeInUnion<
						T,
						Controls["AllowExactly"],
						true,
						"no match"
					> extends true
				? /* exact allowed type => */ never
				: /* test for recursion among union elements */ IfExactTypeInTuple<
							T,
							TAncestorTypes,
							true,
							"no match"
						> extends true
					? /* recursion => */ never
					: T extends object
						? FilterPreservingFunction<
								T,
								{
									[K in keyof T]: ReplaceAllowancesAndRecursionWithNever<
										T[K],
										Controls,
										[TNextAncestor, ...TAncestorTypes]
									>;
								}
							>
						: /* non-object => T as is */ T;

	/**
	 * Test for non-public properties (which can only exist on class instance types).
	 *
	 * Returns `HasNonPublic` if `T` deeply may contain a private or protected field
	 * and `OnlyPublics` otherwise.
	 *
	 * @remarks
	 * Compare original (unprocessed) to filtered case that has `never` where
	 * recursing or where allowed exception types are used.
	 *
	 * Note that this a test of the type and not the actual data. So, if an
	 * interface is given as `T` where implemented by a class, any private or
	 * protected fields within the class will not be detected.
	 *
	 * @system
	 */
	export type IfNonPublicProperties<
		T,
		Controls extends FilterControls,
		HasNonPublic = never,
		OnlyPublics = unknown,
	> = ReplaceAllowancesAndRecursionWithNever<T, Controls> extends T
		? OnlyPublics
		: HasNonPublic;

	// #region JsonSerializable implementation

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
		TAncestorTypes extends unknown[] = [],
		TNextAncestor = T,
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
					? JsonSerializableFilter<T, Controls, TAncestorTypes, TNextAncestor>
					: /* test for non-public properties (class instance type) */
						IfNonPublicProperties<
								T,
								Controls,
								"found non-publics",
								"only publics"
							> extends "found non-publics"
						? /* hidden props => test if it is array properties that are the problem */ T extends readonly (infer _)[]
							? /* array => */ {
									/* use homomorphic mapped type to preserve tuple type */
									[K in keyof T]: JsonSerializableImpl<
										T[K],
										Controls,
										[TNextAncestor, ...TAncestorTypes]
									>;
								}
							: /* not array => error */ SerializationErrorPerNonPublicProperties
						: /* no hidden properties => apply filtering => */ JsonSerializableFilter<
								T,
								Controls,
								TAncestorTypes,
								TNextAncestor
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
		TAncestorTypes extends unknown[],
		TNextAncestor = T,
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ JsonTypeWith<
					Controls["AllowExactly"] | Controls["AllowExtensionOf"]
				>
			: /* test for recursion */ IfExactTypeInTuple<
						T,
						TAncestorTypes,
						true,
						"no match"
					> extends true
				? /* exact recursion; stop here => */ T
				: /* test for JSON Encodable primitive types or given alternate base */ T extends
							| null
							| boolean
							| number
							| string
							| Controls["AllowExtensionOf"]
					? /* primitive types or alternate => */ T
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
												TAncestorTypes,
												JsonSerializableFilter<
													T[K],
													Controls,
													[TNextAncestor, ...TAncestorTypes]
												>
											>;
										}
									: /* not an array => test for exactly `object` */ IsExactlyObject<T> extends true
										? /* `object` => */ NonNullJsonObjectWith<
												Controls["AllowExactly"] | Controls["AllowExtensionOf"]
											>
										: /* test for enum like types */ IfEnumLike<T> extends never
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
																	Controls,
																	[TNextAncestor, ...TAncestorTypes]
																>;
													} & {
														/* optional properties are recursed and, when exactOptionalPropertyTypes is
														   false, are allowed to preserve undefined value type. */
														[K in keyof T as OptionalNonSymbolKeysOf<
															T,
															K
														>]?: JsonSerializableFilter<
															T[K],
															Controls,
															[TNextAncestor, ...TAncestorTypes]
														>;
													} & {
														/* symbol properties are rejected */
														[K in keyof T & symbol]: never;
													}
												>
								: /* not an object => */ never
							: /* function => */ never;

	// #endregion

	// #region JsonDeserialized implementation

	/**
	 * Sentinel type for use when marking points of recursion (in a recursive type).
	 * Type is expected to be unique, though no lengths are taken to ensure that.
	 *
	 * @system
	 */
	export interface RecursionMarker {
		[RecursionMarkerSymbol]: typeof RecursionMarkerSymbol;
	}

	/**
	 * Recursion limit is the count of `+` that prefix it when string.
	 *
	 * @system
	 */
	export type RecursionLimit = `+${string}` | 0;

	/**
	 * Outer implementation of {@link JsonDeserialized} handling meta cases
	 * like recursive types.
	 *
	 * @privateRemarks
	 * This utility is reentrant and will process a type `T` up to RecurseLimit.
	 *
	 * @system
	 */
	export type JsonDeserializedImpl<
		T,
		Options extends Partial<FilterControls>,
		RecurseLimit extends RecursionLimit = "++++" /* 4 */,
	> = /* Build Controls from Options filling in defaults for any missing properties */
	{
		AllowExactly: Options extends { AllowExactly: unknown } ? Options["AllowExactly"] : never;
		AllowExtensionOf: Options extends { AllowExtensionOf: unknown }
			? Options["AllowExtensionOf"]
			: never;
		InternalAllowExactly: never;
	} extends infer Controls
		? /* Controls should always satisfy FilterControls, but Typescript wants a check */
			Controls extends DeserializedFilterControls
			? /* test for 'any' */ boolean extends (T extends never ? true : false)
				? /* 'any' => */ JsonTypeWith<Controls["AllowExactly"] | Controls["AllowExtensionOf"]>
				: /* infer non-recursive version of T */ ReplaceRecursionWithMarkerAndPreserveAllowances<
							T,
							RecursionMarker,
							Controls
						> extends infer TNoRecursionAndOnlyPublics
					? /* test for no change from filtered type */ IsSameType<
							TNoRecursionAndOnlyPublics,
							JsonDeserializedFilter<
								TNoRecursionAndOnlyPublics,
								{
									AllowExactly: Controls["AllowExactly"];
									AllowExtensionOf: Controls["AllowExtensionOf"];
									InternalAllowExactly: Controls["InternalAllowExactly"] | RecursionMarker;
								},
								0
							>
						> extends true
						? /* same (no filtering needed) => test for non-public
						     properties (class instance type) */
							IfNonPublicProperties<
								T,
								Controls,
								"found non-publics",
								"only publics"
							> extends "found non-publics"
							? /* hidden props => apply filtering to avoid retaining
							     exact class except for any classes in allowances => */
								JsonDeserializedFilter<
									T,
									Controls,
									// Note that use of RecurseLimit may not be needed here
									// could have an adverse effect on correctness if there
									// several ancestor types that require modification and
									// are peeling away the limit. In such a case, the limit
									// will be used for the problems and result is already
									// messy; so deferring full understanding of the problems
									// that could arise from a reset and being conservative.
									RecurseLimit
								>
							: /* no hidden properties => deserialized T is just T */
								T
						: /* filtering is needed => */ JsonDeserializedFilter<T, Controls, RecurseLimit>
					: /* unreachable else for infer */ never
			: never /* DeserializedFilterControls assert else; should never be reached */
		: never /* unreachable else for infer */;

	/**
	 * Recurses T applying {@link InternalUtilityTypes.JsonDeserializedFilter} up to RecurseLimit times.
	 *
	 * @system
	 */
	export type JsonDeserializedRecursion<
		T,
		Controls extends DeserializedFilterControls,
		RecurseLimit extends RecursionLimit,
		TAncestorTypes,
	> = T extends TAncestorTypes
		? RecurseLimit extends `+${infer RecursionRemainder}`
			? /* Now that specific recursion is found, process that recursive type
			     directly to avoid any collateral damage from ancestor type that
			     required modification. */
				JsonDeserializedImpl<
					T,
					Controls,
					RecursionRemainder extends RecursionLimit ? RecursionRemainder : 0
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
		Controls extends DeserializedFilterControls,
		RecurseLimit extends RecursionLimit,
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
					: /* test for given internal exact alternate */ IfExactTypeInUnion<
								T,
								Controls["InternalAllowExactly"],
								true,
								"not found"
							> extends true
						? /* exact alternate type => */ T
						: /* test for object */ T extends object
							? /* object => */ ExtractFunctionFromIntersection<T> extends {
									classification: "exactly Function";
								}
								? /* exactly function => */ never
								: /* not exactly a function (Function portion, if any, is omitted) */
									/* => test for array */ T extends readonly (infer _)[]
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
										: /* test for enum like types */ IfEnumLike<T> extends never
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
							: /* not an object => */ never;

	// #endregion
}
