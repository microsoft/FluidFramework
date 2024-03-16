/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils";
import type { Covariant, isAny } from "./typeCheck.js";

/**
 * Constructs a "Branded" type, adding a type-checking only field to `ValueType`.
 *
 * Two usages of `Brand` should never use the same `Name`.
 * If they do, the resulting types will be assignable which defeats the point of this type.
 *
 * This type is constructed such that the first line of type errors when assigning
 * mismatched branded types will be:
 * `Type 'Name1' is not assignable to type 'Name2'.`
 *
 * These branded types are not opaque: A `Brand<A, B>` can still be used as a `B`.
 * @internal
 */
export type Brand<ValueType, Name extends unknown | ErasedType> = ValueType &
	BrandedType<ValueType, Name extends Erased<infer TName> ? TName : Name>;

/**
 * "opaque" handle which can be used to expose a branded type without referencing its value type.
 * @remarks
 * Recommended usage is to use `interface` instead of `type` so tooling (such as tsc and refactoring tools)
 * uses the type name instead of expanding it.
 *
 * @example
 * ```typescript
 * // Public
 * export interface ErasedMyType extends Erased<"myPackage.MyType"> {}
 * // Internal
 * export interface MyType {
 * 	example: number;
 * }
 * export interface BrandedMyType extends Brand<MyType, ErasedMyType> {}
 * // Usage
 * export function extract(input: ErasedMyType): BrandedMyType {
 * 	return fromErased<BrandedMyType>(input);
 * }
 * export function erase(input: MyType): ErasedMyType {
 * 	return brandErased<BrandedMyType>(input);
 * }
 * ```
 * @public
 */
export type Erased<Name> = ErasedType<Name>;

/**
 * Helper for {@link Erased}.
 * This is split out into its own as that's the only way to:
 * - have doc comments for the member.
 * - make the member protected (so you don't accidentally try and read it).
 * - get nominal typing (so types produced without using this class can never be assignable to it).
 *
 * See `MakeNominal` for some more details.
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think it's true in some cases.
 *
 * @sealed
 * @public
 */
export abstract class ErasedType<out Name = unknown> {
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
			"ErasedType is a compile time type brand not a real class that can be used with `instancof` at runtime.",
		);
	}
}

/**
 * Helper for {@link Brand}.
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
 * @internal
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
			"BrandedType is a compile time type brand not a real class that can be used with `instancof` at runtime.",
		);
	}
}

/**
 * Implementation detail of type branding. Should not be used directly outside this file,
 * but shows up as part of branded types so API-Extractor requires it to be exported.
 * @internal
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
 * @internal
 */
export type NameFromBranded<T extends BrandedType<unknown, unknown>> = T extends BrandedType<
	unknown,
	infer Name
>
	? Name
	: never;

/**
 * Converts a {@link Erased} handle to the underlying branded type.
 *
 * It is assumed that only code that produces these "opaque" handles does this conversion,
 * allowing these handles to be considered opaque.
 * @internal
 */
export function fromErased<
	TBranded extends BrandedType<unknown, TName>,
	TName = NameFromBranded<TBranded>,
>(value: TBranded extends BrandedType<unknown, infer Name> ? ErasedType<Name> : never): TBranded {
	return value as unknown as TBranded;
}

/**
 * Adds a type {@link Brand} to a value.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @privateRemarks
 * Leaving `T` unconstrained here allows for better type inference when branding unions.
 * For example when assigning `brand(number)` a number to an optional branded number field,
 * constraining T to `BrandedType<unknown, string>` causes the inference to fail and requires explicitly providing the type parameter.
 * For example leaving T unconstrained instead allows the union of `BrandedType | undefined` to distribute over the conditional allowing the branding only the the union members which should be branded.
 * This does not permit branding an optional value into an optional field since non branded union members are still excluded from input to this function:
 * this is an intended restriction as it causes compile errors for misuse of this function (like using brand when the relevant type is not a branded type).
 * @internal
 */
export function brand<T>(
	value: T extends BrandedType<infer ValueType, unknown> ? ValueType : never,
): T {
	return value as T;
}

/**
 * Adds a type {@link Brand} to a value, returning it as a {@link Erased} handle.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @internal
 */
export function brandErased<T extends BrandedType<unknown, unknown>>(
	value: isAny<ValueFromBranded<T>> extends true ? never : ValueFromBranded<T>,
): ErasedType<NameFromBranded<T>> {
	return value as ErasedType<NameFromBranded<T>>;
}
