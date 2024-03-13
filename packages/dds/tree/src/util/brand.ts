/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NumericOptions, TUnsafe, Type } from "@sinclair/typebox";
import { UsageError } from "@fluidframework/telemetry-utils";
import { Covariant, isAny } from "./typeCheck.js";
import { Assume } from "./utils.js";

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
export type Brand<ValueType, Name extends string | ErasedType<string>> = ValueType &
	BrandedType<ValueType, Name extends Erased<infer TName> ? TName : Assume<Name, string>>;

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
 * @internal
 */
export type Erased<Name extends string> = ErasedType<Name>;

/**
 * Helper for {@link Erased}.
 * This is split out into its own as that's the only way to:
 * - have doc comments for the member.
 * - make the member protected (so you don't accidentally try and read it).
 * - get nominal typing (so types produced without using this class can never be assignable to it).
 *
 * See {@link MakeNominal} for more details.
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think it's true in some cases.
 *
 * @sealed
 * @internal
 */
export abstract class ErasedType<out Name extends string> {
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
 * This is split out into its own as that's the only way to:
 * - have doc comments for the member.
 * - make the member protected (so you don't accidentally try and read it).
 * - get nominal typing (so types produced without using this class can never be assignable to it).
 * - allow use as {@link Opaque} branded type (not assignable to `ValueType`, but captures `ValueType`).
 *
 * See `InternalTypes.MakeNominal` for some more details.
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think it's true in some cases.
 *
 * @remarks
 * This is covariant over ValueType.
 * This is suitable for when ValueType is immutable (like string or number),
 * which is the common use-case for branding.
 *
 * @sealed
 * @internal
 */
export abstract class BrandedType<out ValueType, Name extends string> {
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
 * Converts a Branded type into an "opaque" handle.
 * This prevents the value from being used directly, but does not fully type erase it
 * (and this its not really fully opaque):
 * The type can be recovered using {@link extractFromOpaque},
 * however if we assume only code that produces these "opaque" handles does that conversion,
 * they can function like opaque handles.
 *
 * Recommended usage is to use `interface` instead of `type` so tooling (such as tsc and refactoring tools)
 * uses the type name instead of expanding it:
 * ```typescript
 * export interface MyType extends Opaque<Brand<string, "myPackage.MyType">>{}
 * ```
 * @internal
 */
export type Opaque<T extends Brand<any, string>> = T extends BrandedType<
	infer ValueType,
	infer Name
>
	? BrandedType<ValueType, Name>
	: never;

/**
 * See {@link extractFromOpaque}.
 * @internal
 */
export type ExtractFromOpaque<TOpaque extends BrandedType<any, string>> =
	TOpaque extends BrandedType<infer ValueType, infer Name>
		? isAny<ValueType> extends true
			? unknown
			: Brand<ValueType, Name>
		: never;

/**
 * Implementation detail of type branding. Should not be used directly outside this file,
 * but shows up as part of branded types so API-Extractor requires it to be exported.
 * @internal
 */
export type ValueFromBranded<T extends BrandedType<any, string>> = T extends BrandedType<
	infer ValueType,
	string
>
	? ValueType
	: never;

/**
 * Implementation detail of type branding. Should not be used directly outside this file,
 * but shows up as part of branded types so API-Extractor requires it to be exported.
 * @internal
 */
export type NameFromBranded<T extends BrandedType<any, string>> = T extends BrandedType<
	any,
	infer Name
>
	? Name
	: never;

/**
 * Converts a {@link Opaque} handle to the underlying branded type.
 *
 * It is assumed that only code that produces these "opaque" handles does this conversion,
 * allowing these handles to be considered opaque.
 * @internal
 */
export function extractFromOpaque<TOpaque extends BrandedType<any, string>>(
	value: TOpaque,
): ExtractFromOpaque<TOpaque> {
	return value as ExtractFromOpaque<TOpaque>;
}

/**
 * Converts a {@link Erased} handle to the underlying branded type.
 *
 * It is assumed that only code that produces these "opaque" handles does this conversion,
 * allowing these handles to be considered opaque.
 * @internal
 */
export function fromErased<
	TBranded extends BrandedType<unknown, string>,
	TName extends string = NameFromBranded<TBranded>,
>(value: ErasedType<TName>): TBranded {
	return value as unknown as TBranded;
}

/**
 * Adds a type {@link Brand} to a value.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @internal
 */
export function brand<T extends Brand<any, string>>(
	value: T extends BrandedType<infer ValueType, string> ? ValueType : never,
): T {
	return value as T;
}

/**
 * Adds a type {@link Brand} to a value, returning it as a {@link Opaque} handle.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @internal
 */
export function brandOpaque<T extends BrandedType<any, string>>(
	value: isAny<ValueFromBranded<T>> extends true ? never : ValueFromBranded<T>,
): BrandedType<ValueFromBranded<T>, NameFromBranded<T>> {
	return value as BrandedType<ValueFromBranded<T>, NameFromBranded<T>>;
}

/**
 * Adds a type {@link Brand} to a value, returning it as a {@link Erased} handle.
 *
 * Only do this when specifically allowed by the requirements of the type being converted to.
 * @internal
 */
export function brandErased<T extends BrandedType<any, string>>(
	value: isAny<ValueFromBranded<T>> extends true ? never : ValueFromBranded<T>,
): ErasedType<NameFromBranded<T>> {
	return value as ErasedType<NameFromBranded<T>>;
}

/**
 * Create a TypeBox string schema for a branded string type.
 * This only validates that the value is a string,
 * and not that it came from the correct branded type (that information is lost when serialized).
 */
export function brandedStringType<T extends string>(): TUnsafe<T> {
	// This could use:
	// return TypeSystem.CreateType<T>(name, (options, value) => typeof value === "string")();
	// Since there isn't any useful custom validation to do and
	// TUnsafe is documented as unsupported in `typebox/compiler`,
	// opt for the compile time behavior like the above, but the runtime behavior of the built in string type.
	return Type.String() as unknown as TUnsafe<T>;
}

export function brandedNumberType<T extends number>(
	options?: NumericOptions<number> | undefined,
): TUnsafe<T> {
	// See comments on `brandedStringType`.
	return Type.Number(options) as unknown as TUnsafe<T>;
}
