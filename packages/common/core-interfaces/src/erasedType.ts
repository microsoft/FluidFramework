/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Erased type which can be used to expose a opaque/erased version of a type without referencing the actual type.
 * @remarks
 * This similar to the [type erasure](https://en.wikipedia.org/wiki/Type_erasure) pattern,
 * but for erasing types at the package boundary.
 *
 * This can be used to implement the TypeScript typing for the [handle](https://en.wikipedia.org/wiki/Handle_(computing)) pattern,
 * allowing code outside of a package to have a reference/handle to something in the package in a type safe way without the package having to publicly export the types of the object.
 * This should not be confused with the more specific IFluidHandle which is also named after this design pattern.
 *
 * Recommended usage is to use `interface` instead of `type` so tooling (such as tsc and refactoring tools)
 * uses the type name instead of expanding it.
 *
 * @example
 * ```typescript
 * // public
 * export interface ErasedMyType extends ErasedType<"myPackage.MyType"> {}
 * // internal
 * export interface MyType {
 * 	example: number;
 * }
 * // Usage
 * function extract(input: ErasedMyType): MyType {
 * 	return input as unknown as MyType;
 * }
 * function erase(input: MyType): ErasedMyType {
 * 	return input as unknown as ErasedMyType;
 * }
 * ```
 *
 * Do not use this class with `instanceof`: this will always be false at runtime,
 * but the compiler may think it's true in some cases.
 * @privateRemarks
 * For this pattern to work well it needs to be difficult for a user of the erased type to
 * implicitly use something other than a instance received from the package as an instance of the erased type in type safe code.
 *
 * This means that this type must not be able to be implicitly converted to from any strong type (not `any` or `never`),
 * and no amount of auto complete or auto-implement refactoring will produce something that can be used as an erased type.
 * This is accomplished by:
 *
 * 1. requiring that values of this type be an instance of this class.
 * Typescript does not enforce this requirement for class: only for classes with protected or private members, so such member is included.
 *
 * 2. making this class impossible to get an instance of.
 * This is done by having a private constructor.
 *
 * 3. ensuring different erased types also using this library can not be implicitly converted between each-other.
 * This is done by using the "Name" type parameter.
 * Note that just having the type parameter is not enough since the presence of type parameters has no impact on implicit conversion in TypeScript:
 * only the usages of the type parameter matter.
 *
 * @sealed
 * @public
 */
export abstract class ErasedType<out Name = unknown> {
	/**
	 * Compile time only marker to make type checking more strict.
	 * This method will not exist at runtime and accessing it is invalid.
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
		throw new Error(
			"ErasedType is a compile time type brand not a real class that can be used with `instanceof` at runtime.",
		);
	}
}
