/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @rushstack/no-new-null */

import type { ErasedType } from "./erasedType.js";
import type { IFluidHandle } from "./handles.js";
import type {
	SerializationErrorPerNonPublicProperties,
	SerializationErrorPerUndefinedArrayElement,
} from "./jsonSerializationErrors.js";
import type { JsonTypeWith, NonNullJsonObjectWith, ReadonlyJsonTypeWith } from "./jsonType.js";
import type { OpaqueJsonDeserialized, OpaqueJsonSerializable } from "./opaqueJson.js";

/**
 * Unique symbol for recursion meta-typing.
 */
const RecursionMarkerSymbol: unique symbol = Symbol("recursion here");

/**
 * Union of types that {@link DeepReadonly} and {@link ShallowReadonly}
 * recognize to generate immutable form and optionally can alter their
 * type parameters.
 *
 * @privateRemarks
 * WeakRef should be added when lib is updated to ES2021 or later.
 *
 * @beta
 */
export type ReadonlySupportedGenerics =
	| IFluidHandle
	| Map<unknown, unknown>
	| Promise<unknown>
	| Set<unknown>
	| WeakMap<object, unknown>
	| WeakSet<object>;

/**
 * Limit on processing recursive types.
 * Use of `"NoLimit"` may result in error:
 * "ts(2589): Type instantiation is excessively deep and possibly infinite".
 * In such cases, use string literal with some prefix series of `+`
 * characters. The length of `+` character sequence indicates the recursion
 * depth limit when a recursive type is found. Use of `0` will stop applying
 * `DeepReadonly` at the first point recursion is detected.
 *
 * @beta
 * @system
 */
export type DeepReadonlyRecursionLimit = "NoLimit" | 0 | `+${string}`;

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
		 * Tuple of exact types that are managed by custom serialization/deserialization
		 * logic (beyond JSON.stringify and JSON.parse without replacers/revivers).
		 * Only exact types matching specification will be preserved unaltered.
		 */
		AllowExactly: unknown[];

		/**
		 * General types that are managed by custom serialization/deserialization
		 * logic (beyond JSON.stringify and JSON.parse without replacers/revivers).
		 * Any type satisfying specification will be preserved unaltered.
		 */
		AllowExtensionOf: unknown;
	}

	/**
	 * Meta-type for controlling filtering utilities that additionally supplies
	 * a substitute type for degenerate cases.
	 *
	 * @system
	 */
	interface FilterControlsWithSubstitution extends FilterControls {
		/**
		 * Type to use for degenerate cases like `unknown` or `any`.
		 * Typically this will be `JsonTypeWith<TupleToUnion<AllowExactly> | AllowExtensionOf>`.
		 */
		DegenerateSubstitute: unknown;
	}

	/**
	 * Meta-type for controlling deserialized filtering utilities.
	 *
	 * @system
	 */
	interface DeserializedFilterControls extends FilterControlsWithSubstitution {
		/**
		 * Type to use for degenerate `object` case.
		 * Typically this will be `NonNullJsonObjectWith<TupleToUnion<AllowExactly> | AllowExtensionOf>`.
		 */
		DegenerateNonNullObjectSubstitute: unknown;
	}

	/**
	 * Returns non-symbol keys for optional properties of an object type.
	 * This excludes indexed properties that are inherently _optional_.
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
	 * This includes indexed properties that are inherently _optional_.
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
		TExactExceptions extends unknown[],
		TExtendsException,
		Result extends
			| { WhenSomethingDeserializable: unknown; WhenNeverDeserializable: never }
			| { WhenSomethingDeserializable: never; WhenNeverDeserializable: unknown },
	> = /* ensure working with more than never */ T extends never
		? /* never => */ Result["WhenNeverDeserializable"]
		: /* check for extends exception */ T extends TExtendsException
			? /* extends exception => */ Result["WhenSomethingDeserializable"]
			: /* no extends exception => check for exact exception */ IfExactTypeInTuple<
					T,
					TExactExceptions,
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
	 * Similar to `Exclude` but only excludes exact members of `U` from `T`
	 * rather than any type that extends members of `U`.
	 *
	 * @system
	 */
	export type ExcludeExactlyInTuple<T, TupleOfU extends unknown[]> = IfExactTypeInTuple<
		T,
		TupleOfU,
		never,
		T
	>;

	/**
	 * Similar to `Omit` but operates on tuples.
	 * Removes elements of `Tuple` that extend `U`.
	 *
	 * @system
	 */
	export type OmitFromTuple<
		Tuple extends unknown[],
		U,
		Accumulated extends unknown[] = [],
	> = Tuple extends [infer First, ...infer Rest]
		? OmitFromTuple<Rest, U, First extends U ? Accumulated : [...Accumulated, First]>
		: Accumulated;

	/**
	 * Similar to `OmitFromTuple` but removes only exact matches of U.
	 * Removes elements of `Tuple` that are exactly `U`.
	 *
	 * @remarks If `U` is a union, then only exactly matching union elements of `Tuple` are removed.
	 * @system
	 */
	export type OmitExactlyFromTuple<
		Tuple extends unknown[],
		U,
		Accumulated extends unknown[] = [],
	> = Tuple extends [infer First, ...infer Rest]
		? OmitExactlyFromTuple<Rest, U, IfSameType<First, U, Accumulated, [...Accumulated, First]>>
		: Accumulated;

	/**
	 * Returns non-symbol keys for defined, (likely) serializable properties of an
	 * object type. Keys with fully unsupported properties (undefined, symbol, and
	 * bigint) and sometimes unsupported (functions) are excluded. An exception to
	 * that is when there are supported types in union with just bigint.
	 *
	 * For homomorphic mapping use with `as` to filter. Example:
	 * `[K in keyof T as NonSymbolWithDeserializablePropertyOf<T, [], never, K>]: ...`
	 *
	 * @system
	 */
	export type NonSymbolWithDeserializablePropertyOf<
		T extends object,
		TExactExceptions extends unknown[],
		TExtendsException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: /* all possible types that aren't already allowed, with the exception of `unknown` */
			ExcludeExactlyInTuple<
				Exclude<T[K], TExtendsException>,
				OmitExactlyFromTuple<TExactExceptions, unknown>
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
	 * `[K in keyof T as NonSymbolWithPossiblyDeserializablePropertyOf<T, [], never, K>]: ...`
	 *
	 * @system
	 */
	export type NonSymbolWithPossiblyDeserializablePropertyOf<
		T extends object,
		TExactExceptions extends unknown[],
		TExtendsException,
		Keys extends keyof T = keyof T,
	> = Exclude<
		{
			[K in Keys]: /* all possible types that aren't already allowed, with the exception of `unknown` */
			ExcludeExactlyInTuple<
				Exclude<T[K], TExtendsException>,
				OmitExactlyFromTuple<TExactExceptions, unknown>
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
							OmitExactlyFromTuple<TExactExceptions, unknown>,
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
						: /* test for exact alternative */ IfExactTypeInTuple<
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
				: /* test for exact alternative */ IfExactTypeInTuple<
						T,
						Controls["AllowExactly"],
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
	 * @remarks Use caution when one of the type might be `{}`. That type is
	 * special and produces unexpected results. This includes variability
	 * on past usages.
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
	 * Tests for an exact match of `T` in `Tuple[0]`. If not found,
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
	 * @remarks Use caution when one of the type might be `{}`. That type is
	 * special and produces unexpected results. This includes variability
	 * on past usages.
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
	 * Any Record type.
	 *
	 * @system
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `any` for property types is required to avoid "Index signature for type 'string' is missing in type" in some outside `FlattenIntersection` uses.
	export type AnyRecord = Record<keyof any, any>;

	/**
	 * Creates a simple object type from an intersection of multiple.
	 * @privateRemarks
	 * `T extends AnyRecord` within the implementation encourages tsc to process
	 * intersections within unions.
	 *
	 * @system
	 */
	export type FlattenIntersection<T extends AnyRecord> = T extends AnyRecord
		? {
				[K in keyof T]: T[K];
			}
		: T;

	/**
	 * Convenience constraint for any Opaque Json type.
	 *
	 * @remarks
	 * Use in extends check: `T extends AnyOpaqueJsonType`
	 *
	 * @system
	 */
	export type AnyOpaqueJsonType =
		/* eslint-disable @typescript-eslint/no-explicit-any -- must use `any` for invariant constraint override */
		| OpaqueJsonSerializable<unknown, any, unknown>
		| OpaqueJsonDeserialized<unknown, any, unknown>;
	/* eslint-enable @typescript-eslint/no-explicit-any */

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
	 * @typeParam TAncestorTypes - Tuple of types that are ancestors of T.
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
					: /* test for exact allowance */ IfExactTypeInTuple<
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
	 * @typeParam TAncestorTypes - Tuple of types that are ancestors of T.
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
			: /* test for exact allowance */ IfExactTypeInTuple<
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

	/**
	 * Union of all types in a tuple.
	 *
	 * @system
	 */
	export type TupleToUnion<T extends unknown[]> = T[number];

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
		AllowExactly: Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [];
		AllowExtensionOf: Options extends { AllowExtensionOf: unknown }
			? Options["AllowExtensionOf"]
			: never;
		// There Substitute type could be extracted to helper type, but are kept explicit here
		// to make JsonTypeWith show explicitly in results for users, rather
		// than either the helper type name or a partially unrolled version.
		DegenerateSubstitute: JsonTypeWith<
			| (Options extends { AllowExactly: unknown[] }
					? TupleToUnion<Options["AllowExactly"]>
					: never)
			| (Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never)
		>;
	} extends infer Controls
		? /* Controls should always satisfy FilterControlsWithSubstitution, but Typescript wants a check */
			Controls extends FilterControlsWithSubstitution
			? /* test for 'any' */ boolean extends (T extends never ? true : false)
				? /* 'any' => */ Controls["DegenerateSubstitute"]
				: Options["IgnoreInaccessibleMembers"] extends "ignore-inaccessible-members"
					? JsonSerializableFilter<T, Controls, TAncestorTypes, TNextAncestor>
					: /* test for non-public properties (class instance type) */
						IfNonPublicProperties<
								T,
								{
									AllowExactly: Controls["AllowExactly"];
									AllowExtensionOf:
										| Controls["AllowExtensionOf"]
										// Add in primitives that may be branded to ignore intersection classes
										| boolean
										| number
										| string
										// Add in Opaque Json types
										| AnyOpaqueJsonType;
									DegenerateSubstitute: Controls["DegenerateSubstitute"];
								},
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
							: /* test for potentially branded primitive (intersection with a supported primitive) */
								T extends boolean | number | string
								? /* assume intersection is branding and allow as-is => */ T
								: /* not array => error */ SerializationErrorPerNonPublicProperties
						: /* no hidden properties => apply filtering => */ JsonSerializableFilter<
								T,
								Controls,
								TAncestorTypes,
								TNextAncestor
							>
			: never /* FilterControlsWithSubstitution assert else; should never be reached */
		: never /* unreachable else for infer */;

	/**
	 * Handle Opaque Json types for {@link JsonSerializable}.
	 *
	 * @remarks
	 * {@link OpaqueJsonSerializable} and {@link OpaqueJsonDeserialized} instances
	 * are limited to `Controls` given context supports. Further, the data type
	 * is filtered through {@link JsonSerializable} with those `Controls`.
	 *
	 * @privateRemarks
	 * Additional intersections beyond {@link OpaqueJsonSerializable},
	 * {@link OpaqueJsonDeserialized}, or intersected matching opaque pair are
	 * not correctly filtered as need is not expected.
	 *
	 * @system
	 */
	export type JsonSerializableOpaqueAllowances<
		T extends AnyOpaqueJsonType,
		Controls extends FilterControlsWithSubstitution,
	> = /* eslint-disable @typescript-eslint/no-explicit-any -- must use `any` for invariant constraint override */
	/* infer underlying data type */ T extends
		| OpaqueJsonSerializable<infer TData, any, unknown>
		| OpaqueJsonDeserialized<infer TData, any, unknown>
		? T extends OpaqueJsonSerializable<TData, any, unknown> &
				OpaqueJsonDeserialized<TData, any, unknown>
			? OpaqueJsonSerializable<
					JsonSerializableImpl<TData, Controls>,
					Controls["AllowExactly"],
					Controls["AllowExtensionOf"]
				> &
					OpaqueJsonDeserialized<
						JsonSerializableImpl<TData, Controls>,
						Controls["AllowExactly"],
						Controls["AllowExtensionOf"]
					>
			: T extends OpaqueJsonSerializable<TData, any, unknown>
				? OpaqueJsonSerializable<
						JsonSerializableImpl<TData, Controls>,
						Controls["AllowExactly"],
						Controls["AllowExtensionOf"]
					>
				: T extends OpaqueJsonDeserialized<TData, any, unknown>
					? OpaqueJsonDeserialized<
							JsonSerializableImpl<TData, Controls>,
							Controls["AllowExactly"],
							Controls["AllowExtensionOf"]
						>
					: "internal error: failed to determine Opaque Json type"
		: never;
	/* eslint-enable @typescript-eslint/no-explicit-any */

	/**
	 * Essentially a check for a template literal that has $\{string\} or
	 * $\{number\} in the pattern. Just `string` and/or `number` also match.
	 *
	 * @remarks This works recursively looking at first elements when not
	 * `string` or `number`. `first` will just be a single character if
	 * not $\{string\} or $\{number\}.
	 *
	 * @system
	 */
	export type IfIndexKey<T, IfIndex, IfLiteral> = `${string}` extends T
		? IfIndex
		: number extends T
			? IfIndex
			: T extends `${infer first}${infer rest}`
				? string extends first
					? IfIndex
					: `${number}` extends first
						? IfIndex
						: IfIndexKey<rest, IfIndex, IfLiteral>
				: IfLiteral;

	/**
	 * Helper for {@link JsonSerializableFilter} to determine if a property may
	 * be `undefined` and selects from options for result.
	 * Since `unknown` is a superset of `undefined`, it is given a special case.
	 * Additionally since index signatures are inherently optional, `unknown` typed
	 * values are treated as not undefined (`Result["Otherwise"]`).
	 *
	 * @system
	 */
	export type IfPossiblyUndefinedProperty<
		TKey,
		TValue,
		Result extends {
			IfPossiblyUndefined: unknown;
			IfUnknownNonIndexed: unknown;
			Otherwise: unknown;
		},
	> = undefined extends TValue
		? unknown extends TValue
			? IfIndexKey<TKey, Result["Otherwise"], Result["IfUnknownNonIndexed"]>
			: Result["IfPossiblyUndefined"]
		: Result["Otherwise"];

	/**
	 * Core implementation of {@link JsonSerializable}.
	 *
	 * @privateRemarks
	 * Filtering through a single layer of recursion is all that is required
	 * when using in prescribed filter scenario.
	 *
	 * @system
	 */
	export type JsonSerializableFilter<
		T,
		Controls extends FilterControlsWithSubstitution,
		TAncestorTypes extends unknown[],
		TNextAncestor = T,
	> = /* test for 'any' */ boolean extends (T extends never ? true : false)
		? /* 'any' => */ Controls["DegenerateSubstitute"]
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ Controls["DegenerateSubstitute"]
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
					: /* test for exact alternate */ IfExactTypeInTuple<
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
												TupleToUnion<Controls["AllowExactly"]> | Controls["AllowExtensionOf"]
											>
										: /* test for enum like types */ IfEnumLike<T> extends never
											? /* enum or similar simple type (return as-is) => */ T
											: /* test for Opaque Json types */ T extends AnyOpaqueJsonType
												? /* Opaque Json type => */ JsonSerializableOpaqueAllowances<
														T,
														Controls
													>
												: /* property bag => */ FlattenIntersection<
														{
															/* required properties are recursed and may not have undefined values. */
															[K in keyof T as RequiredNonSymbolKeysOf<
																T,
																K
															>]-?: IfPossiblyUndefinedProperty<
																K,
																T[K],
																{
																	IfPossiblyUndefined: {
																		["error required property may not allow `undefined` value"]: never;
																	};
																	IfUnknownNonIndexed: {
																		["error required property may not allow `unknown` value"]: never;
																	};
																	Otherwise: JsonSerializableFilter<
																		T[K],
																		Controls,
																		[TNextAncestor, ...TAncestorTypes]
																	>;
																}
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

	// #region JsonDeserialized implementation

	/**
	 * Outer implementation of {@link JsonDeserialized} handling meta cases
	 * like recursive types.
	 *
	 * @privateRemarks
	 * This utility is reentrant and will process a type `T` up to `RecurseLimit`.
	 *
	 * @system
	 */
	export type JsonDeserializedImpl<
		T,
		Options extends Partial<FilterControls>,
		RecurseLimit extends RecursionLimit = "++++" /* 4 */,
	> = /* Build Controls from Options filling in defaults for any missing properties */
	{
		AllowExactly: Options extends { AllowExactly: unknown[] } ? Options["AllowExactly"] : [];
		AllowExtensionOf: Options extends { AllowExtensionOf: unknown }
			? Options["AllowExtensionOf"]
			: never;
		// There Substitute types could be extracted to helper type, but are kept explicit here
		// to make JsonTypeWith/NonNullJsonObjectWith show explicitly in results for users, rather
		// than either the helper type name or a partially unrolled version.
		DegenerateSubstitute: JsonTypeWith<
			| (Options extends { AllowExactly: unknown[] }
					? TupleToUnion<Options["AllowExactly"]>
					: never)
			| (Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never)
		>;
		DegenerateNonNullObjectSubstitute: NonNullJsonObjectWith<
			| (Options extends { AllowExactly: unknown[] }
					? TupleToUnion<Options["AllowExactly"]>
					: never)
			| (Options extends { AllowExtensionOf: unknown } ? Options["AllowExtensionOf"] : never)
		>;
	} extends infer Controls
		? /* Controls should always satisfy DeserializedFilterControls, but Typescript wants a check */
			Controls extends DeserializedFilterControls
			? /* test for 'any' */ boolean extends (T extends never ? true : false)
				? /* 'any' => */ Controls["DegenerateSubstitute"]
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
									AllowExactly: [...Controls["AllowExactly"], RecursionMarker];
									AllowExtensionOf: Controls["AllowExtensionOf"];
									DegenerateSubstitute: Controls["DegenerateSubstitute"];
									DegenerateNonNullObjectSubstitute: Controls["DegenerateNonNullObjectSubstitute"];
								},
								0
							>
						> extends true
						? /* same (no filtering needed) => test for non-public
						     properties (class instance type) */
							IfNonPublicProperties<
								T,
								// Note: no extra allowance is made here for possible branded
								// primitives as JsonDeserializedFilter will allow them as
								// extensions of the primitives. Should there need a need to
								// explicit allow them here, see JsonSerializableImpl's use.
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
	 * Recurses `T` applying {@link InternalUtilityTypes.JsonDeserializedFilter} up to `RecurseLimit` times.
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
			: Controls["DegenerateSubstitute"]
		: JsonDeserializedFilter<T, Controls, RecurseLimit, TAncestorTypes | T>;

	/**
	 * Handle Opaque Json types for {@link JsonDeserialized}.
	 *
	 * @remarks
	 * {@link OpaqueJsonSerializable} instances are converted to {@link OpaqueJsonDeserialized}.
	 * The `AllowExactly` and `AllowExtensionOf` properties are set to match the given `Controls`.
	 * The data type is kept exactly as-is to avoid processing in generic contexts that can't
	 * produce a meaningful result. The data type should always be filtered through
	 * {@link JsonDeserialized} when {@link OpaqueJsonDeserialized} is cracked open. So, really
	 * the filtering is just deferred.
	 *
	 * @privateRemarks
	 * Additional intersections beyond {@link OpaqueJsonSerializable},
	 * {@link OpaqueJsonDeserialized}, or intersected matching opaque pair are
	 * not correctly filtered as need is not expected.
	 *
	 * @system
	 */
	export type JsonDeserializedOpaqueConversion<
		T extends AnyOpaqueJsonType,
		Controls extends FilterControls,
	> = /* eslint-disable @typescript-eslint/no-explicit-any -- must use `any` for invariant constraint override */
	T extends
		| OpaqueJsonSerializable<infer TData, any, unknown>
		| OpaqueJsonDeserialized<infer TData, any, unknown>
		? OpaqueJsonDeserialized<TData, Controls["AllowExactly"], Controls["AllowExtensionOf"]>
		: "internal error: failed to determine Opaque Json type";
	/* eslint-enable @typescript-eslint/no-explicit-any */

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
		? /* 'any' => */ Controls["DegenerateSubstitute"]
		: /* test for 'unknown' */ unknown extends T
			? /* 'unknown' => */ Controls["DegenerateSubstitute"]
			: /* test for deserializable primitive types or given alternate base */ T extends
						| null
						| boolean
						| number
						| string
						| Controls["AllowExtensionOf"]
				? /* primitive types or alternate => */ T
				: /* test for given exact alternate */ IfExactTypeInTuple<
							T,
							Controls["AllowExactly"],
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
									? /* `object` => */ Controls["DegenerateNonNullObjectSubstitute"]
									: /* test for enum like types */ IfEnumLike<T> extends never
										? /* enum or similar simple type (return as-is) => */ T
										: /* test for matching Opaque Json types */ T extends AnyOpaqueJsonType
											? /* Opaque Json type => */ JsonDeserializedOpaqueConversion<T, Controls>
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

	// #region *Readonly implementations

	/**
	 * If `T` is a `Map<K,V>` or `ReadonlyMap<K,V>`, returns `ReadonlyMap` and,
	 * if `T` extends `DeepenedGenerics`, {@link DeepReadonly} is applied to
	 * `K` and `V` generics. `Else` is returned if not a generic map.
	 *
	 * @system
	 */
	export type DeepenReadonlyInMapIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends ReadonlyMap<infer K, infer V>
		? Map<K, V> extends DeepenedGenerics
			? ReadonlyMap<
					ReadonlyImpl<K, DeepenedGenerics, NoDepthOrRecurseLimit>,
					ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>
				>
			: ReadonlyMap<K, V>
		: Else;

	/**
	 * If `T` is a `Set<TSet>` or `ReadonlySet<TSet>`, returns `ReadonlySet` and,
	 * if `T` extends `DeepenedGenerics`, {@link DeepReadonly} is applied to
	 * `TSet` generic. `Else` is returned if not a generic set.
	 *
	 * @system
	 */
	export type DeepenReadonlyInSetIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends ReadonlySet<infer V>
		? Set<V> extends DeepenedGenerics
			? ReadonlySet<ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>>
			: ReadonlySet<V>
		: Else;

	/**
	 * If `T` is a `IFluidHandle<THandle>` and if `T` extends `DeepenedGenerics`,
	 * {@link DeepReadonly} is applied to `THandle` generic.
	 * `Else` is returned if not an `IFluidHandle`.
	 *
	 * @system
	 */
	export type DeepenReadonlyInFluidHandleIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends Readonly<IFluidHandle<infer V>>
		? IFluidHandle<V> extends DeepenedGenerics
			? Readonly<IFluidHandle<ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>>>
			: Readonly<T>
		: Else;

	/**
	 * If `T` is a `Promise<TPromise>` and if `T` extends `DeepenedGenerics`,
	 * {@link DeepReadonly} is applied to `TPromise` generic.
	 * `Else` is returned if not a `Promise`.
	 *
	 * @system
	 */
	export type DeepenReadonlyInPromiseIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends Promise<infer V>
		? Promise<V> extends DeepenedGenerics
			? Promise<ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>>
			: T
		: Else;

	/**
	 * If `T` is a `WeakMap<K,V>`, returns immutable `WeakMap` and,
	 * if `T` extends `DeepenedGenerics`, {@link DeepReadonly} is applied to
	 * `K` and `V` generics. `Else` is returned if not a generic map.
	 *
	 * @system
	 */
	export type DeepenReadonlyInWeakMapIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends Omit<WeakMap<infer K, infer V>, "delete" | "set">
		? WeakMap<K, V> extends DeepenedGenerics
			? Omit<
					WeakMap<
						ReadonlyImpl<K, DeepenedGenerics, NoDepthOrRecurseLimit>,
						ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>
					>,
					"delete" | "set"
				>
			: Omit<WeakMap<K, V>, "delete" | "set">
		: Else;

	/**
	 * If `T` is a `WeakSet<TSet>`, returns immutable `WeakSet` and,
	 * if `T` extends `DeepenedGenerics`, {@link DeepReadonly} is applied to
	 * `TSet` generic. `Else` is returned if not a generic weak set.
	 *
	 * @system
	 */
	export type DeepenReadonlyInWeakSetIfEnabled<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = T extends Omit<WeakSet<infer V>, "add" | "delete">
		? WeakSet<V> extends DeepenedGenerics
			? Omit<
					WeakSet<ReadonlyImpl<V, DeepenedGenerics, NoDepthOrRecurseLimit>>,
					"add" | "delete"
				>
			: Omit<WeakSet<V>, "add" | "delete">
		: Else;

	/**
	 * If `T` is a {@link ReadonlySupportedGenerics}, `T` is returned as
	 * its immutable version, and if `T` extends `DeepenedGenerics`,
	 * {@link DeepReadonly} is applied to `T`s generics.
	 *
	 * @system
	 */
	export type DeepenReadonlyInGenerics<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
		Else,
	> = DeepenReadonlyInMapIfEnabled<
		T,
		DeepenedGenerics,
		NoDepthOrRecurseLimit,
		DeepenReadonlyInSetIfEnabled<
			T,
			DeepenedGenerics,
			NoDepthOrRecurseLimit,
			DeepenReadonlyInWeakMapIfEnabled<
				T,
				DeepenedGenerics,
				NoDepthOrRecurseLimit,
				DeepenReadonlyInWeakSetIfEnabled<
					T,
					DeepenedGenerics,
					NoDepthOrRecurseLimit,
					DeepenReadonlyInPromiseIfEnabled<
						T,
						DeepenedGenerics,
						NoDepthOrRecurseLimit,
						DeepenReadonlyInFluidHandleIfEnabled<
							T,
							DeepenedGenerics,
							NoDepthOrRecurseLimit,
							Else
						>
					>
				>
			>
		>
	>;

	/**
	 * Returns an `ErasedType` or "branded" primitive type as-is, or `Else` if not.
	 * @typeParam T - Type to test.
	 * @typeParam Else - Type to return if not `ErasedType` or "branded" primitive.
	 *
	 * @system
	 */
	export type PreserveErasedTypeOrBrandedPrimitive<
		T extends object,
		Else,
	> = /* Test for erased type */ T extends ErasedType<infer _>
		? /* erased type => keep as-is */ T
		: /* Test for branded primitive */ T extends infer Brand &
					(boolean | number | string | symbol | bigint)
			? // Should just return T here, but TypeScript appears to produce `never` when doing so.
				// Workaround by inferring the Primitive type and returning intersection with B.
				T extends Brand & infer Primitive
				? /* [potentially] branded type => "as-is" */ Primitive & Brand
				: /* Should never be reached */ T
			: Else;

	/**
	 * De-multiplexing implementation of {@link DeepReadonly} and {@link ShallowReadonly}
	 * selecting behavior based on `NoDepthOrRecurseLimit`.
	 *
	 * @privateRemarks
	 * This utility is reentrant. Its importance is that other utilities common to
	 * readonly transformation may use `NoDepthOrRecurseLimit` to return the the
	 * same processing algorithm.
	 *
	 * @system
	 */
	export type ReadonlyImpl<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends "Shallow" | DeepReadonlyRecursionLimit,
	> = /* test for no depth */ NoDepthOrRecurseLimit extends "Shallow"
		? /* no depth => */ ShallowReadonlyImpl<T, DeepenedGenerics>
		: /* test for no limit */ NoDepthOrRecurseLimit extends "NoLimit"
			? /* no limit => */ DeepReadonlyRecursingInfinitely<T, DeepenedGenerics>
			: /* limited */ DeepReadonlyLimitingRecursion<
					T,
					DeepenedGenerics,
					Extract<NoDepthOrRecurseLimit, RecursionLimit>
				>;

	// #region ShallowReadonly implementation

	/**
	 * Outer implementation of {@link ShallowReadonly}.
	 *
	 * @privateRemarks
	 * This utility can be reentrant when generics are deepened.
	 *
	 * @system
	 */
	export type ShallowReadonlyImpl<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
	> = T extends object
		? /* object => */ FilterPreservingFunction<
				T,
				DeepenReadonlyInGenerics<
					T,
					DeepenedGenerics,
					"Shallow",
					PreserveErasedTypeOrBrandedPrimitive<T, /* basic type => */ Readonly<T>>
				>
			>
		: /* not an object => */ T;

	// #endregion

	/**
	 * Outer implementation of {@link DeepReadonly}.
	 *
	 * @privateRemarks
	 * This utility is reentrant and will process a type `T` up to `RecurseLimit`.
	 *
	 * @system
	 */
	export type DeepReadonlyImpl<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		RecurseLimit extends DeepReadonlyRecursionLimit,
	> = ReadonlyImpl<T, DeepenedGenerics, RecurseLimit>;

	// #region DeepReadonly infinite recursion implementation

	/**
	 * Simple implementation of {@link DeepReadonly} that may handle limited recursive types.
	 * In unhandled cases, TypeScript will produce:
	 * ts(2589): Type instantiation is excessively deep and possibly infinite.
	 *
	 * @system
	 */
	export type DeepReadonlyRecursingInfinitely<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
	> = T extends object
		? /* object => */ FilterPreservingFunction<
				T,
				// test for array of known recursive type: JsonTypeWith
				T extends readonly ReadonlyJsonTypeWith<infer Alternates>[]
					? // Make sure this is exactly that case (many arrays will extend JsonTypeWith)
						// Note that `true extends IfExactTypeInTuple` is used over
						// if-else form as the else branch would be evaluated as input to
						// `IfExactTypeInTuple` and that could lead to infinite recursion.
						true extends IfExactTypeInTuple<
							T,
							[JsonTypeWith<Alternates>[], readonly ReadonlyJsonTypeWith<Alternates>[]]
						>
						? readonly ReadonlyJsonTypeWith<
								DeepReadonlyRecursingInfinitely<Alternates, DeepenedGenerics>
							>[]
						: {
								readonly [K in keyof T]: DeepReadonlyRecursingInfinitely<
									T[K],
									DeepenedGenerics
								>;
							}
					: /* not JSON array => */ DeepenReadonlyInGenerics<
							T,
							DeepenedGenerics,
							"NoLimit",
							PreserveErasedTypeOrBrandedPrimitive<
								T,
								/* basic type => */ {
									readonly [K in keyof T]: DeepReadonlyRecursingInfinitely<
										T[K],
										DeepenedGenerics
									>;
								}
							>
						>
			>
		: /* not an object => */ T;

	// #endregion
	// #region DeepReadonly limited recursion implementation

	/**
	 * Core implementation of {@link DeepReadonly} handling meta cases
	 * like recursive types a limited number of times.
	 *
	 * @privateRemarks
	 * This utility is reentrant and will process a type `T` up to `NoDepthOrRecurseLimit`.
	 *
	 * @system
	 */
	export type DeepReadonlyLimitingRecursion<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		NoDepthOrRecurseLimit extends RecursionLimit,
	> = /* infer non-recursive version of T */ ReplaceRecursionWithMarkerAndPreserveAllowances<
		T,
		RecursionMarker,
		{ AllowExactly: []; AllowExtensionOf: never }
	> extends infer TNoRecursionAndOnlyPublics
		? /* test for no change from altered type (excluding non-publics) */ IsSameType<
				TNoRecursionAndOnlyPublics,
				DeepReadonlyWorker<TNoRecursionAndOnlyPublics, DeepenedGenerics, 0>
			> extends true
			? /* same (no filtering needed) => test for non-public properties (class instance type) */
				IfNonPublicProperties<
					T,
					// Note: no extra allowance is made here for possible branded
					// primitives as DeepReadonlyWorker will allow them as
					// extensions of the primitives. Should there need a need to
					// explicit allow them here, see JsonSerializableImpl's use.
					{ AllowExactly: []; AllowExtensionOf: never },
					"found non-publics",
					"only publics"
				> extends "found non-publics"
				? /* hidden props => apply filtering => */
					DeepReadonlyWorker<
						T,
						DeepenedGenerics,
						Extract<NoDepthOrRecurseLimit, RecursionLimit>
					>
				: /* no hidden properties => readonly T is just T */
					T
			: /* filtering is needed => */ DeepReadonlyWorker<
					T,
					DeepenedGenerics,
					Extract<NoDepthOrRecurseLimit, RecursionLimit>
				>
		: /* unreachable else for infer */ never;

	/**
	 * Recurses `T` applying {@link InternalUtilityTypes.DeepReadonlyWorker} up to `RecurseLimit` times.
	 *
	 * @system
	 */
	export type DeepReadonlyRecursion<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		RecurseLimit extends RecursionLimit,
		TAncestorTypes = T /* Always start with self as ancestor; otherwise recursion limit appears one greater */,
	> = T extends TAncestorTypes
		? RecurseLimit extends `+${infer RecursionRemainder}`
			? /* Now that specific recursion is found, process that recursive type
			     directly to avoid any collateral damage from ancestor type that
			     required modification. */
				DeepReadonlyLimitingRecursion<
					T,
					DeepenedGenerics,
					RecursionRemainder extends RecursionLimit ? RecursionRemainder : 0
				>
			: T
		: DeepReadonlyWorker<T, DeepenedGenerics, RecurseLimit, TAncestorTypes | T>;

	/**
	 * Core implementation of {@link InternalUtilityTypes.DeepReadonlyLimitingRecursion}.
	 *
	 * @system
	 */
	export type DeepReadonlyWorker<
		T,
		DeepenedGenerics extends ReadonlySupportedGenerics,
		RecurseLimit extends RecursionLimit,
		TAncestorTypes = T /* Always start with self as ancestor; otherwise recursion limit appears one greater */,
	> = /* test for object */ T extends object
		? /* object => */ FilterPreservingFunction<
				T,
				DeepenReadonlyInGenerics<
					T,
					DeepenedGenerics,
					RecurseLimit,
					PreserveErasedTypeOrBrandedPrimitive<
						T,
						/* basic type => */ {
							readonly [K in keyof T]: DeepReadonlyRecursion<
								T[K],
								DeepenedGenerics,
								RecurseLimit,
								TAncestorTypes
							>;
						}
					>
				>
			>
		: /* not an object => */ T;

	// #endregion
	// #endregion
}
