/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Erased type which can be used to expose a opaque/erased version of a type without referencing the actual type.
 * @remarks
 * This similar to the {@link https://en.wikipedia.org/wiki/Type_erasure | type erasure} pattern,
 * but for erasing types at the package boundary.
 *
 * This can be used to implement the TypeScript typing for the {@link https://en.wikipedia.org/wiki/Handle_(computing) | handle} pattern,
 * allowing code outside of a package to have a reference/handle to something in the package in a type safe way without the package having to publicly export the types of the object.
 * This should not be confused with the more specific IFluidHandle which is also named after this design pattern.
 *
 * Recommended usage is to use `interface` instead of `type` so tooling (such as tsc and refactoring tools)
 * uses the type name instead of expanding it.
 *
 * @example
 * ```typescript
 * // public sealed type
 * export interface ErasedMyType extends ErasedType<"myPackage.MyType"> {}
 * // internal type
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

/**
 * Used to mark a `@sealed` interface in a strongly typed way to prevent external implementations.
 * @remarks
 * This is an alternative to {@link ErasedType} which is more ergonomic to implement in the case where the implementation can extend `ErasedTypeImplementation`.
 *
 * Users of interfaces extending this should never refer to anything about this class:
 * migrating the type branding to another mechanism, like {@link ErasedType} should be considered a non-breaking change.
 * @privateRemarks
 * Implement interfaces which extend this by sub-classing {@link ErasedTypeImplementation}.
 *
 * This class should only be a `type` package export, preventing users from extending it directly.
 *
 * Since {@link ErasedTypeImplementation} is exported as `@internal`, this restricts implementations of the sealed interfaces to users of `@internal` APIs, which should be anything within this release group.
 * Any finer grained restrictions can be done as documentation, but not type enforced.
 * @sealed
 * @beta
 * @system
 */
export abstract class ErasedBaseType<out Name = unknown> {
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
	 * @privateRemarks
	 * From an API perspective, private would be preferred here.
	 * However protected is almost as good since this class is not package exported,
	 * and it allows ErasedTypeImplementation to extend this class.
	 */
	protected constructor() {}
}

/**
 * An implementation of an {@link ErasedBaseType}.
 * For a given erased type interface, there should be exactly one implementation of it, and it must be defined by the same code which defined the interface.
 *
 * @typeParam TInterface - The erased type interface this class implements.
 * @remarks
 * {@link ErasedBaseType} is package exported only as a type, not a value, so the only way to subclass it is via this class.
 * This limitation help enforce the pattern that there is only one implementation of a given erased type interface.
 * @internal
 */
export abstract class ErasedTypeImplementation<
	TInterface extends ErasedBaseType,
> extends ErasedBaseType<TInterface extends ErasedBaseType<infer Name> ? Name : never> {
	protected readonly brand!: (
		dummy: never,
	) => TInterface extends ErasedBaseType<infer Name> ? Name : never;

	protected constructor() {
		super();
	}

	/**
	 * {@link https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates|Type predicate} for narrowing the internal implementation type via `instanceof`.
	 */
	public static [Symbol.hasInstance]<TThis extends { prototype: object }>(
		this: TThis,
		value: unknown,
	): value is InstanceTypeRelaxed<TThis> {
		return (
			typeof value === "object" &&
			value !== null &&
			Object.prototype.isPrototypeOf.call(this.prototype, value)
		);
	}

	/**
	 * {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions|Type assertion} which narrows from ErasedBaseType to the internal implementation type.
	 * @remarks
	 * This does a checked conversion, throwing a `TypeError` if invalid.
	 *
	 * It would be safer if this narrowed from `TInterface`, but that is not possible since type parameters can not be accessed in static methods.
	 * Replacing `ErasedTypeImplementation` with a generic function which returns a non-generic class could be used to work around this limitation if desired.
	 *
	 * Derived classes can provide their own customized narrowing function with a more specific types if desired.
	 */
	public static narrow<TThis extends { prototype: object }>(
		this: TThis,
		value: ErasedBaseType | InstanceTypeRelaxed<TThis>,
	): asserts value is InstanceTypeRelaxed<TThis> {
		if (!ErasedTypeImplementation[Symbol.hasInstance].call(this, value as object)) {
			throw new TypeError("Invalid ErasedBaseType instance");
		}
	}

	/**
	 * Upcasts the instance to the erased interface type.
	 * @remarks
	 * This is mainly useful when inferring the interface type is required.
	 */
	public upCast<TThis extends TInterface>(this: TThis): TInterface {
		return this;
	}
}

/**
 * The same as the built-in InstanceType, but works on classes with private constructors.
 * @privateRemarks
 * This is based on the trick in {@link https://stackoverflow.com/a/74657881}.
 * @internal
 */
export type InstanceTypeRelaxed<TClass> = InstanceType<(new () => never) & TClass>;
