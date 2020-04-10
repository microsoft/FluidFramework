/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { DependencyContainer } from "./dependencyContainer";

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to a string representation
 * of that property.
 *
 * @example - \{ IComponentFoo: "IComponentFoo" \}
 */
export type ComponentSymbolProvider<T extends keyof IComponent> = {
    [P in T]: NonNullable<P>;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to an object that implements
 * the property.
 */
export type AsyncRequiredComponentProvider<T extends keyof IComponent> = {
    [P in T]: NonNullable<IComponent[T]>
};

/**
  * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type AsyncOptionalComponentProvider<T extends keyof IComponent> = {
    [P in T]: Promise<IComponent[T] | undefined>;
};

/**
 * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type mapped to an object that implements
 * the property.
 */
export type ComponentProvider<T extends keyof IComponent> = {
    [P in T]: NonNullable<IComponent[T]>
};

export type Provider<T extends keyof IComponent> =
    ComponentProvider<T>
    | Promise<ComponentProvider<T>>
    | ((dependencyContainer: DependencyContainer) => ComponentProvider<T>)
    | ((dependencyContainer: DependencyContainer) => Promise<ComponentProvider<T>>);
