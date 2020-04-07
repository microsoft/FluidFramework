/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

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
export type ComponentProvider<T extends keyof IComponent> = {
    [P in T]: NonNullable<IComponent[T]>
};

/**
  * This is a condensed version of Record that requires the object has all
 * the IComponent properties as its type, mapped to an object that implements
 * the property or undefined.
 */
export type OptionalComponentProvider<T extends keyof IComponent> = {
    [P in T]: IComponent[T] | undefined;
};

/**
 * A Scope is a collection of optional and required providers.
 */
export type Scope<O extends keyof IComponent, R extends keyof IComponent>
    = OptionalComponentProvider<O> & ComponentProvider<R>;
