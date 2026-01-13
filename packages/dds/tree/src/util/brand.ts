/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { Covariant } from "./typeCheck.js";

/**
 * Constructs a "Branded" type, adding a type-checking only field to `ValueType`.
 * @remarks
 * Two usages of `Brand` should never use the same `Name`.
 * If they do, the resulting types will be assignable which defeats the point of this type.
 *
 * This type is constructed such that the first line of type errors when assigning
 * mismatched branded types will be:
 * `Type 'Name1' is not assignable to type 'Name2'.`
 *
 * These branded types are not opaque: A `Brand<A, B>` can still be used as a `A`.
 *
 * @example Simple usage:
 * ```typescript
 * export type StrongId = Brand<string, "tree.StrongId">;
 * const x: StrongId = brand("myId");
 * ```
 */
export type Brand<ValueType, Name> = ValueType & BrandedType<ValueType, Name>;

/**
 * Implementation detail for {@link Brand}.
 *
 * See `MakeNominal` for some more details.
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think it's true in some cases.
 *
 * @remarks
 * This is covariant over ValueType.
 * This is suitable for when ValueType is immutable (like string or number),
 * which is the common use-case for branding.
 *
 * @privateRemarks
 * This is split out into its own type as that's the only way to:
 *
 * - make the member protected (so you can't accidentally try and access it).
 * - get nominal typing (so types produced without using this class can never be assignable to it).
 *
 * @sealed
 */
export abstract class BrandedType<out ValueType, Name> {
	protected _typeCheck?: Covariant<ValueType>;
	/**
	 * Compile time only marker to make type checking more strict.
	 * This method will not exist at runtime and accessing it is invalid.
	 * See {@link Brand} for details.
	 *
	 * @privateRemarks
	 * `Name` is used as the return type of a method rather than a a simple readonly member as this allows types with two brands to be intersected without getting `never`.
	 * The method takes in never to help emphasize that its not callable.
	 */
	protected abstract brand(dummy: never): Name;

	/**
	 * This class should never exist at runtime, so make it un-constructable.
	 */
	private constructor() {}

	/**
	 * Since this class is a compile time only type brand, `instanceof` will never work with it.
	 * This `Symbol.hasInstance` implementation ensures that `instanceof` will error if used,
	 * and in TypeScript 5.3 and newer will produce a compile time error if used.
	 */
	public static [Symbol.hasInstance](value: never): value is never {
		throw new UsageError(
			"BrandedType is a compile time type brand not a real class that can be used with `instanceof` at runtime.",
		);
	}
}

/**
 * Implementation detail of type branding. Should not be used directly outside this file,
 * but shows up as part of branded types so API-Extractor requires it to be exported.
 */
export type ValueFromBranded<T extends BrandedType<unknown, unknown>> = T extends BrandedType<
	infer ValueType,
	unknown
>
	? ValueType
	: never;

/**
 * Implementation detail of type branding. Should not be used directly outside this file,
 * but shows up as part of branded types so API-Extractor requires it to be exported.
 */
export type NameFromBranded<T extends BrandedType<unknown, unknown>> = T extends BrandedType<
	unknown,
	infer Name
>
	? Name
	: never;

/**
 * Adds a type {@link Brand} to a value.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @remarks
 * This infers the branded type from context so it can very easily be used to a semantically invalid conversion.
 * Treat this like "as" casts: they are an indicator that the user/reader must ensure the conversion is valid.
 *
 * If branding a constant, and wanting to preserve the exact typing of the constant, use {@link brandConst} instead.
 * @privateRemarks
 * Leaving `T` unconstrained here allows for better type inference when branding unions.
 * For example when assigning `brand(number)` a number to an optional branded number field,
 * constraining T to `BrandedType<unknown, string>` causes the inference to fail and requires explicitly providing the type parameter.
 * For example leaving T unconstrained instead allows the union of `BrandedType | undefined` to distribute over the conditional allowing the branding only the the union members which should be branded.
 * This does not permit branding an optional value into an optional field since non branded union members are still excluded from input to this function:
 * this is an intended restriction as it causes compile errors for misuse of this function (like using brand when the relevant type is not a branded type).
 */
export function brand<T>(
	value: T extends BrandedType<infer ValueType, unknown> ? ValueType : never,
): T {
	return value as T;
}

/**
 * Adds a type {@link Brand} to a value, while preserving the exact type of the value being branded.
 * @remarks
 * This takes in the type to brand to as a required type parameter, unlike {@link brand} which infers it from context.
 * This also preserves the exact type of the value being branded.
 * TypeScript has no way to take an explicit type parameter and infer another in a single generic context.
 * To work around this, two generic contexts are used, first a function to infer the parameter type,
 * and a second function (returned) to take the explicit type parameter.
 *
 * This is intended for use when branding constants.
 * @example
 * ```typescript
 * const requiredIdentifier = brandConst("Value")<FieldKindIdentifier>();
 * ```
 * @privateRemarks
 * The dummy parameter is used to produce a compile error in the event where the value being branded is incompatible with the branded type.
 */
export function brandConst<const T>(
	value: T,
): <T2 extends BrandedType<unknown, unknown>>(
	...dummy: T extends (T2 extends BrandedType<infer ValueType, unknown> ? ValueType : never)
		? []
		: [never]
) => T2 & T {
	return <T2>() => value as T2 & T;
}

/**
 * Removes a type brand from a branded value.
 * @remarks
 * This is useful when trying to do an exhaustive switch over a union of branded types,
 * which for some reason fails if the brand is not removed from the "case" entries.
 */
export function unbrand<const T extends BrandedType<unknown, unknown>>(
	value: T,
): ValueFromBranded<T> {
	return value as never;
}

/**
 * Make an enum like object using {@link Brand} to brand the values.
 * @remarks
 * This has stricter typing than TypeScript built in enums since it does not allow implicit assignment of `number` to enums with a numeric value.
 * It also blocks implicit conversions of individual constants to the enum type:
 * such cases must use {@link brand} or get the branded value from the enum instead.
 *
 * One limitation is that narrowing does not work in switch statements:
 * the values in each case can use {@link unbrand} to work around this.
 *
 * This object does not provide {@link https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings | reverse mappings}.
 *
 * @example
 * ```typescript
 * const TestA = strictEnum("TestA", {
 * 	a: 1,
 * 	b: 2,
 * });
 * type TestA = Values<typeof TestA>;
 *
 * function switchUnbrand(x: TestA) {
 * 	switch (x) {
 * 		case unbrand(TestA.a):
 * 			return "a";
 * 		case unbrand(TestA.b):
 * 			return "b";
 * 		default:
 * 			unreachableCase(x);
 * 	}
 * }
 * ```
 */
export function strictEnum<const T, const TBrand>(
	name: TBrand,
	entries: T,
): { readonly [Property in keyof T]: Brand<T[Property], TBrand> } {
	return entries as {
		readonly [Property in keyof T]: Brand<T[Property], TBrand>;
	};
}

/**
 * Extracts the values of an object type as a union.
 * @remarks
 * Like `keyof`	except for values.
 * This is useful for extracting the value types of enums created with {@link strictEnum}.
 */
export type Values<T> = T[keyof T];
