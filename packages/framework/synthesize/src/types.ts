/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject } from "@fluidframework/component-core-interfaces";
import { DependencyContainer } from "./dependencyContainer";

export type ComponentKey<T extends IFluidObject> = keyof T & keyof IFluidObject;

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type mapped to a string representation
 * of that property.
 *
 * @example - \{ IComponentFoo: "IComponentFoo" \}
 */
export type ComponentSymbolProvider<T extends IFluidObject> = {
    [P in ComponentKey<T>]: ComponentKey<T> & P;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type mapped to an object that implements
 * the property.
 */
export type AsyncRequiredComponentProvider<T extends keyof IFluidObject> = {
    [P in T]: Promise<NonNullable<IFluidObject[P]>>
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IFluidObject properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type AsyncOptionalComponentProvider<T extends keyof IFluidObject> = {
    [P in T]: Promise<IFluidObject[P] | undefined>;
};

/**
 * Combined type for Optional and Required Async Component Providers
 */
export type AsyncComponentProvider<O extends keyof IFluidObject, R extends keyof IFluidObject>
    = AsyncOptionalComponentProvider<O> & AsyncRequiredComponentProvider<R>;

/**
 * Provided a keyof IFluidObject will ensure the type is an instance of that type
 */
export type NonNullableComponent<T extends keyof IFluidObject> = NonNullable<IFluidObject[T]>;

/**
 * Multiple ways to provide a component.
 */
export type ComponentProvider<T extends keyof IFluidObject> =
    NonNullableComponent<T>
    | Promise<NonNullableComponent<T>>
    | ((dependencyContainer: DependencyContainer) => NonNullableComponent<T>)
    | ((dependencyContainer: DependencyContainer) => Promise<NonNullableComponent<T>>);

/**
 * ProviderEntry is a mapping of the type to the Provider
 */
export interface ProviderEntry<T extends keyof IFluidObject> {
    type: T;
    provider: ComponentProvider<T>
}

/**
 * A mapping of ProviderEntries
 */
export type DependencyContainerRegistry = Iterable<ProviderEntry<any>>;
