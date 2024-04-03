/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Produces a valid FluidObject key given a type and a property.
 *
 * @remarks
 *
 * A valid FluidObject key is a property that exists on the incoming type
 * as well as on the type of the property itself. For example: `IProvideFoo.IFoo.IFoo`
 * This aligns with the FluidObject pattern expected to be used with all FluidObjects.
 *
 * This utility type is meant for internal use by {@link FluidObject}
 *
 * @example
 *
 * ```typescript
 * interface IProvideFoo{
 *  IFoo: IFoo
 * }
 * interface IFoo extends IProvideFoo{
 *  foobar();
 * }
 * ```
 *
 * This pattern enables discovery, and delegation in a standard way which is central
 * to FluidObject pattern.
 * @public
 */
export type FluidObjectProviderKeys<T, TProp extends keyof T = keyof T> = string extends TProp
	? never
	: number extends TProp
	? never // exclude indexers [key:string |number]: any
	: TProp extends keyof Required<T>[TProp] // TProp is a property of T, and T[TProp]
	? Required<T>[TProp] extends Required<Required<T>[TProp]>[TProp] // T[TProp] is the same type as T[TProp][TProp]
		? TProp
		: never
	: never;

/**
 * This utility type take interface(s) that follow the FluidObject pattern, and produces
 * a new type that can be used for inspection and discovery of those interfaces.
 *
 * It is meant to be used with types that are known to implement the FluidObject pattern.
 * A common way to specify a type implements the FluidObject pattern is to expose it as a
 * FluidObject without a generic argument.
 *
 * @example
 *
 * For example, if we have an interface like the following:
 *
 * ```typescript
 * interface IProvideFoo{
 *  IFoo: IFoo
 * }
 * interface IFoo extends IProvideFoo{
 *  foobar();
 * }
 * ```
 *
 * and a function that returns a FluidObject. You would do the following
 *
 * `const maybeFoo: FluidObject<IFoo> = getFluidObject()`;
 *
 * Either IFoo or IProvideFoo are valid generic arguments. In both case
 * maybeFoo will be of type `{IFoo?: IFoo}`. If IFoo is not undefined,
 * then the FluidObject provides IFoo, and it can be used.
 *
 * You can inspect multiple types via a intersection. For example:
 * `FluidObject<IFoo & IBar>`
 * @public
 */
export type FluidObject<T = unknown> = {
	[P in FluidObjectProviderKeys<T>]?: T[P];
};

/**
 * This utility type creates a type that is the union of all keys on the generic type
 * which implement the FluidObject pattern.
 *
 * See {@link FluidObject}
 *
 * For example `FluidObjectKeys<IFoo & IBar>` would result in `"IFoo" | "IBar"`
 * @public
 */
export type FluidObjectKeys<T> = keyof FluidObject<T>;
