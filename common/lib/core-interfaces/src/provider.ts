/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 * This utility type is primarily meant for internal use by @see Provider
 * Produces a valid Provider key given a type and a property.
 * A valid Provider key is a property that exists on the incoming type
 * as well as on the type of the property itself. For example, IProvideFoo.IFoo.IFoo
 * This aligns with the provider pattern expected to be used with all Providers.
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
 * to Provider pattern
 */
 export type ProviderPropertyKeys<T, TProp extends keyof T = keyof T> =
    string extends TProp ? never : number extends TProp? never : // exclude indexers [key:string |number]: any
    TProp extends keyof T[TProp] // TProp is a property of T, T[TProp] and, T[TProp][TProp]
        ? TProp extends keyof T[TProp][TProp] // ex; IProvideFoo.IFoo.IFoo.IFoo
            ? TProp
            :never
        : never;

/**
 * This utility type take interface(s) that follow the provider pattern, and produces
 * a new type that can be used for inspection and discovery of those interfaces.
 *
 * It is meant to be used with types that are know to implement the provider pattern.
 * A common way to specify that a type implements that pattern is to expose it as a
 * Provider without a generic argument.
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
 * and a function that returns and Provider. You would do the following
 *
 * `const maybeFoo : Provider<IFoo> = getUnknown()`;
 *
 * Either IFoo or IProvideFoo are valid generic arguments. In both case
 * maybeFoo will be of type `{IFoo?: IFoo}`. If IFoo is no undefined,
 * then the IFluidUnknown implements IFoo, and it can be used.
 *
 * You can inspect multiple types via a intersection. For example:
 * `Provider<IFoo & IBar>`
 *
 */
 export type Provider<T = unknown> = Partial<Pick<T, ProviderPropertyKeys<T>>>;

/**
 * This utility type creates a type that is the union of all keys on the generic type
 * which implement the provider pattern. @see Provider
 *
 * For example `ProviderKeys<IFoo | IBar>` would result in `"IFoo" | "IBar"`
 *
 */
export type ProviderKeys<T> = keyof Provider<T>;
