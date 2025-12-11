/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base branded type which can be used to annotate other type.
 *
 * @remarks
 * `BrandedType` is covariant over its type parameter, which could be leveraged
 * for any generic type, but the preferred pattern is to specify variance
 * explicitly in a derived class making that clear and guaranteeing branding is
 * unique. It is convenient to have the derived class be the generic given to
 * `BrandedType`.
 *
 * ### Direct use [simple]
 *
 * Use `T & BrandedType<"BrandName">` to create a type conforming to `T` and
 * also branded with name "BrandName".
 *
 * ### Derived class use [preferred]
 *
 * Derive another class declaration and ideally add additional
 * protected properties to distinguish the type. (Private properties would
 * {@link https://github.com/microsoft/TypeScript/issues/20979#issuecomment-361432516|lose their type when exported}
 * and public properties would allow structural typing and show up on the branded
 * values.)
 *
 * Then use `T & MyBrandedType<U>` to create a type conforming to `T` and
 * also branded with the derived brand.
 *
 * ### Runtime
 *
 * Since branded types are not real value types, they will always need to be
 * created using `as` syntax and often `as unknown` first.
 *
 * This class should never exist at runtime, so it is only declared.
 *
 * @example
 * Definition of two branded types with different variance:
 * ```typescript
 * // A brand that is covariant over given T
 * declare class CovariantBrand<T> extends BrandedType<CovariantBrand<unknown>> {
 *    // Does not allow unrelated or less derived CovariantBrand-ed types to be
 *    // assigned. CovariantBrand<string> is not assignable to CovariantBrand<"literal">.
 *    protected readonly CovariantBrand: T;
 *    private constructor();
 * }
 * // A brand that is contravariant over given T
 * declare class ContravariantBrand<T> extends BrandedType<ContravariantBrand<unknown>> {
 *    // Does not allow unrelated or more derived ContravariantBrand-ed types to be
 *    // assigned. ContravariantBrand<"literal"> is not assignable to ContravariantBrand<string>.
 *    protected readonly ContravariantBrand: (_: T) => void;
 *    private constructor();
 * }
 * ```
 *
 * Applying a brand to a type through type-guard:
 * ```typescript
 * function numberIs5(n: number): n is number & CovariantBrand<5> {
 *    return n === 5;
 * }
 * function onlyAccept4_5_or_6(_n: number & CovariantBrand<4 | 5 | 6>): void {}
 *
 * function example(n: number) {
 *    if (numberIs5(n)) {
 *       onlyAccept4_5_or_6(n); // OK: CovariantBrand<5> is assignable to CovariantBrand<4 | 5 | 6>;
 *   }
 * }
 * ```
 *
 * @internal
 */
export declare class BrandedType<out Brand> {
	/**
	 * Compile time only marker to make type checking more strict.
	 * This method will not exist at runtime and accessing it is invalid.
	 *
	 * @privateRemarks
	 * `Brand` is used as the return type of a method rather than a simple
	 * readonly property as this allows types with two brands to be
	 * intersected without getting `never`.
	 * The method takes in `never` to help emphasize that it's not callable.
	 */
	protected readonly brand: (dummy: never) => Brand;

	protected constructor();

	/**
	 * Since this class is a compile time only type brand, `instanceof` will
	 * never work with it. * This `Symbol.hasInstance` implementation ensures
	 * that `instanceof` will error if used, and in TypeScript 5.3 and newer
	 * will produce a compile time error if used.
	 */
	public static [Symbol.hasInstance](value: never): value is never;
}
