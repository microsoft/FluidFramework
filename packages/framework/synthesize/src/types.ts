/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { DependencyContainer } from "./dependencyContainer";

export type ComponentKey<T extends IComponent> = keyof T & keyof IComponent;

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to a string representation
 * of that property.
 *
 * @example - \{ IComponentFoo: "IComponentFoo" \}
 */
export type ComponentSymbolProvider<T extends IComponent> = {
    [P in ComponentKey<T>]: ComponentKey<T> & P;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to an object that implements
 * the property.
 */
export type AsyncRequiredComponentProvider<T extends keyof IComponent> = {
    [P in T]: Promise<NonNullable<IComponent[P]>>
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type AsyncOptionalComponentProvider<T extends keyof IComponent> = {
    [P in T]: Promise<IComponent[P] | undefined>;
};

/**
 * Combined type for Optional and Required Async Component Providers
 */
export type AsyncComponentProvider<O extends keyof IComponent, R extends keyof IComponent>
    = AsyncOptionalComponentProvider<O> & AsyncRequiredComponentProvider<R>;

type NonNullableComponent<T extends keyof IComponent> = NonNullable<IComponent[T]>;

/**
 * Multiple ways to provide a component.
 */
export type ComponentProvider<T extends keyof IComponent> =
    NonNullableComponent<T>
    | Promise<NonNullableComponent<T>>
    | ((dependencyContainer: DependencyContainer) => NonNullableComponent<T>)
    | ((dependencyContainer: DependencyContainer) => Promise<NonNullableComponent<T>>);

/**
 * ProviderEntry is a mapping of the type to the Provider
 */
export interface ProviderEntry<T extends keyof IComponent> {
    type: T;
    provider: ComponentProvider<T>
}

/**
 * A mapping of ProviderEntries
 */
export type DependencyContainerRegistry = Iterable<ProviderEntry<any>>;
