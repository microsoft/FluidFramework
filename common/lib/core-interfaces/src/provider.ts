/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 * This utility type is meant for internal use by @see FluidObject
 * Produces a valid FluidObject key given a type and a property.
 * A valid FluidObject key is a property that exists on the incoming type
 * as well as on the type of the property itself. For example, IProvideFoo.IFoo.IFoo
 * This aligns with the FluidObject pattern expected to be used with all FluidObjects.
 * For example:
 * ```
 * interface IProvideFoo{
 *  IFoo: IFoo
 * }
 * interface IFoo extends IProvideFoo{
 *  foobar();
 * }
 * ```
 * This pattern enables discovery, and delegation in a standard way which is central
 * to FluidObject pattern
 */
 export type FluidObjectProviderKeys<T, TProp extends keyof T = keyof T> =
    string extends TProp ? never : number extends TProp? never : // exclude indexers [key:string |number]: any
    TProp extends keyof Exclude<T[TProp], undefined> // TProp is a property of T, and T[TProp]
        ? TProp
        :never;

/**
 * This utility type take interface(s) that follow the FluidObject pattern, and produces
 * a new type that can be used for inspection and discovery of those interfaces.
 *
 * It is meant to be used with types that are known to implement the FluidObject pattern.
 * A common way to specify a type implements the FluidObject pattern is to expose it as a
 * FluidObject without a generic argument.
 *
 * For example, if we have an interface like below
 * ```
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
 *
 */
 export type FluidObject<T = unknown> = Partial<Pick<T, FluidObjectProviderKeys<T>>>;

/**
 * This utility type creates a type that is the union of all keys on the generic type
 * which implement the FluidObject pattern. @see FluidObject
 *
 * For example `FluidObjectKeys<IFoo & IBar>` would result in `"IFoo" | "IBar"`
 *
 */
export type FluidObjectKeys<T> = keyof FluidObject<T>;
